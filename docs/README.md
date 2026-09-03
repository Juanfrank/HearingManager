# Judiciary Hearing Administrator

A companion app that sits alongside a single, already-created Microsoft
Teams meeting (one meeting per hearing day/session) and helps judges and
court staff manage multiple sub-hearings happening within it: tracking
who's connected, grouping participants by hearing number, promoting/
demoting mic-camera access per group, and recording timing/notes/
attendance — all without leaving Teams.

This app does **not** create or administer meetings org-wide. The meeting
already exists and its initial roles (judges/secretary/participants) are
assigned by another system; this app only manages what happens inside that
one meeting.

## Architecture

Built as a Teams meeting extension: a bot + a tab, not a standalone
external web app.

```
manifest/   Teams app manifest (bot + configurable tab registration)
backend/    Express + Socket.IO + Prisma — application state, all Graph
            calls, roster ingestion from the bot, derived hearing status
tab/        React tab UI (Teams JS SDK for meeting/user context,
            socket.io-client for live push updates — no polling)
```

- **Bot** (`backend/src/bot`, Bot Framework SDK / botbuilder): joins the
  meeting, receives roster events (`conversationUpdate` member add/remove),
  and is the source of truth for "who is currently connected."
- **Tab** (`tab/`): the in-meeting side panel UI judges/staff see docked in
  Teams. Talks to the backend only, never directly to Graph.
- **Backend** (`backend/`): holds hearings/parties/roster/remap/audit
  state, performs all Microsoft Graph calls, pushes live updates to the tab
  over a socket.
- **Database**: Postgres via Prisma (`backend/prisma/schema.prisma`) — low
  volume, high integrity data, not a scale problem.

## Azure / Entra ID prerequisites (manual — cannot be done in code)

These require the court's Microsoft 365 tenant admin, not just a
developer. **The app runs and is fully demoable without these** — the
backend defaults to `GRAPH_MODE=mock`, which logs what it *would* send to
Graph instead of calling out — but real mic/camera promotion, roster
identity resolution, and messaging need every one of these done first:

1. App registration in the tenant's Entra ID (one App ID for this whole
   app) — this is `MICROSOFT_APP_ID` in `backend/.env` and the `id` /
   `webApplicationInfo` fields in `manifest/manifest.json`.
2. Delegated permission consent for `OnlineMeetings.ReadWrite` (judges/
   staff sign in via Teams SSO, acting as themselves).
3. Application permission consent for `OnlineMeetings.ReadWrite.All`, and
   (only if/when calling is built — see "Explicitly out of scope" below)
   `Calls.AccessMedia.All` / `Calls.JoinGroupCall.All`, plus
   `Chat.ReadWrite` / `ChatMessage.Send` for messaging.
4. A Teams **Application Access Policy**
   (`New-CsApplicationAccessPolicy` / `Grant-CsApplicationAccessPolicy`)
   scoping which organizer accounts (judges) this app is allowed to manage
   meetings for.
5. Tenant admin approval to sideload/publish the Teams app package
   (`manifest/manifest.json` + icons, see `manifest/README.md`).

Once these exist, set `GRAPH_MODE=real` and fill in
`MICROSOFT_APP_ID` / `MICROSOFT_APP_PASSWORD` / `MICROSOFT_APP_TENANT_ID`
and `ORGANIZER_USER_ID` / `ONLINE_MEETING_ID` in `backend/.env`, and wire
real token acquisition into `getAccessToken()` in `backend/src/graph/client.ts`
(currently throws — MSAL client-credentials or on-behalf-of flow goes
there).

## Auth: Teams SSO

Every `/api/*` request (REST and the Socket.IO handshake) requires a
validated identity — this is what the audit log's `actorEmail` is actually
backed by, not a client-supplied header:

- **`tab/src/teamsContext.ts`**'s `getAuthToken()` calls
  `microsoftTeams.authentication.getAuthToken()`, which — once the tenant
  admin has consented to this app (§3 above) — silently returns an Azure AD
  access token for this app's own App ID (audience =
  `webApplicationInfo.id`/`.resource` in `manifest/manifest.json`), no
  popup or password prompt. `tab/src/api.ts` and `tab/src/socket.ts` attach
  it as `Authorization: Bearer <token>` on every call.
- **`backend/src/auth/verifyTeamsToken.ts`**'s `requireTeamsUser` (REST,
  mounted in `index.ts`) and the equivalent Socket.IO handshake check
  (`ws.ts`) verify that token's signature (against Azure AD's public keys,
  via `jwks-rsa`), audience, and tenant, then extract the signed-in user's
  `preferred_username`/`upn` as `req.actorEmail` — the value every route
  now uses for audit-log attribution instead of trusting a client header.

**Known gap**: this only covers the *silent* SSO path. If the tenant hasn't
done org-wide admin consent for this app's `access_as_user` scope yet (or
consent is per-user), `getAuthToken()` rejects with
`resourceRequiresConsent`/`invalid_grant`, and there's currently no
interactive-consent fallback (`microsoftTeams.authentication.authenticate`
popup + `tab/auth-start.html`/`auth-end.html` pages) wired up — add that if
this deployment can't rely on admin consent being done ahead of time.

**Local dev without a real Entra app registration**: set
`AUTH_MODE=dev-bypass` in `backend/.env` (the default in
`.env.example`) — routes then trust an `x-actor-email` header (or the
tab's `?actorEmail=` query-param override) instead of validating a real
token. **Never set `AUTH_MODE=dev-bypass` in production** — it lets any
caller attribute audit-log entries to any judge they like.

`POST /api/roster/event` and `/api/roster/connection-health` (dev-only
roster simulation, see below) are additionally gated behind
`ALLOW_ROSTER_SIMULATION=true` regardless of `AUTH_MODE` — the real bot
never calls them over HTTP (`backend/src/bot/index.ts` calls the same
underlying function in-process), so leaving them open in production would
let any signed-in user fabricate attendance.

## Local development

### Backend

```
cd backend
cp .env.example .env         # fill in DATABASE_URL at minimum
npm install
npx prisma migrate dev       # requires a reachable Postgres — see below
npm run dev                  # http://localhost:3978
```

`prisma/schema.prisma`'s `provider` is `postgresql` — the production
target. Prisma's SQLite connector does **not** support `enum` or `Json`
columns, both of which this schema uses (hearing/party/judge roles, and
the audit log's before/after snapshots), so a plain SQLite swap doesn't
work here. For local dev, run a real (but disposable) local Postgres
instead — e.g. `pg_ctlcluster <version> main start` if installed locally,
or `docker run -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16` —
and point `DATABASE_URL` at it. No org-wide Postgres server needed.

With `GRAPH_MODE=mock` and `AUTH_MODE=dev-bypass` (both defaults in
`.env.example`), you can drive the whole hearing lifecycle without a live
Teams meeting or a real Entra app registration — pass `x-actor-email` on
each call, and `POST /api/roster/event`
(`{ email, displayName, type: "joined" | "left" }`) to simulate join/leave:

```
curl -X POST http://localhost:3978/api/hearings \
  -H 'Content-Type: application/json' -H 'x-actor-email: judge1@court.gov' \
  -d '{"hearingNumber": 12, "expectedParties": [...]}'
```

and the usual `/api/hearings/:id/{activate,complete,reactivate}` /
`/api/remap` / `/api/messages` endpoints, same header. See
`backend/src/services/statusDerivation.test.ts` for the attendance-status
rules exercised as unit tests (`npx vitest run`).

### Tab

```
cd tab
npm install
npm run dev                  # http://localhost:53000
```

Outside of a real Teams meeting, open it directly in a browser with
`?actorEmail=judge1@court.gov` to simulate being signed in as that judge —
this skips real SSO token acquisition entirely (`tab/src/teamsContext.ts`)
and sends `x-actor-email` instead, so the backend must also be running
with `AUTH_MODE=dev-bypass` for this to work.

## Build-order status

Per the original build instructions, in order:

1. ✅ Manifest, bot shell, tab shell
2. ✅ Bot roster ingestion → live presence (via `backend/src/bot`, and the
   `/api/roster/event` dev path both bot and future callers share)
3. ✅ Hearing/ExpectedParty data model + derived status logic
   (`backend/src/services/statusDerivation.ts`)
4. ✅ Activate/Complete → Graph role PATCH, with the full authoritative
   attendee-role map rebuilt and resent on every call
   (`backend/src/graph/roleManager.ts`) — **mocked** pending the Entra
   prerequisites above. Before going live: pilot-test that the role PATCH
   visibly changes mic/camera capability in the real Teams client — Graph
   returning success is not by itself proof the client honored it.
5. ✅ Time periods, notes, reactivate flow
6. ✅ Remap/undo flow
7. ✅ Messaging (`backend/src/routes/messages.ts`) — mocked, same as (4)
8. ⛔ Calling — explicitly out of scope for this build. Requires a
   registered calling bot via the Cloud Communications API, real-time media
   handling, and `Calls.Initiate.All`. The call icon in the tab currently
   shows a "not yet built" message rather than doing nothing silently.
9. ✅ Audit logging — every role change, remap, undo, notes edit, and
   status transition is logged with actor/timestamp/before-after via
   `backend/src/services/auditLog.ts`, called from every mutation route
   rather than bolted on afterward. Actor identity is now a verified Teams
   SSO token (`backend/src/auth/verifyTeamsToken.ts`), not a client-trusted
   header — see "Auth: Teams SSO" above.

## Non-functional notes

- **Throttling**: `backend/src/graph/client.ts` wraps Graph calls with
  429/`Retry-After` backoff.
- **Resilience**: if the bot's roster/Graph connection drops mid-hearing,
  `setRosterStale(true)` (called from the bot's error path) flips
  `rosterStale` in the state snapshot pushed to the tab, which shows a
  "status may be stale" banner rather than silently showing outdated
  presence.
- **Audit logging**: see build-order item 9 above — this data may need to
  hold up as a record of how a hearing was actually conducted; audit rows
  are append-only, never mutated or deleted by app code.
