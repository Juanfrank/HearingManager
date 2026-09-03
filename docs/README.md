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

### Multi-meeting: one shared backend, many concurrent meetings

This backend serves any number of simultaneous Teams meetings at once — a
central deployment for a court with several courtrooms, each running its
own hearing session in parallel, rather than one backend redeployed per
session. The tenant boundary is the `Meeting` model
(`backend/prisma/schema.prisma`), keyed by **the Teams meeting/conversation
ID** — the same ID Teams hands the bot on every activity
(`activity.conversation.id`, `backend/src/bot/index.ts`) and the tab from
its own meeting context (`context.meeting.id`,
`tab/src/teamsContext.ts`'s `getMeetingId()`), so both sides agree on which
Meeting a given event belongs to with no extra lookup or configuration.

Every table that matters (`Hearing`, `RosterEntry`, `JudgeOrAuxiliary`,
`AuditLogEntry`) carries a `meetingId`, and every REST route is mounted
under `/api/meetings/:meetingId/...` (`backend/src/index.ts`) — a request
for one meeting's hearings can never see or touch another's, enforced at
the Prisma query level in every route (`backend/src/routes/*.ts`), not
just by the client not asking. The Socket.IO layer mirrors this:
`backend/src/ws.ts` requires `meetingId` in the connection handshake and
joins each socket to a room scoped to it, so a state push for one meeting
is never broadcast to a tab watching another.

The Graph role-PATCH (`backend/src/graph/roleManager.ts`) additionally
needs to know which organizer/online-meeting Graph identifiers correspond
to a given Teams meeting ID — those are optional fields on the `Meeting`
row (`organizerUserId`/`onlineMeetingId`), settable via
`POST /api/meetings/:meetingId/register` (`backend/src/routes/meetings.ts`,
called by the tab once on startup). If unset, Graph calls fall back to the
deployment-wide `ORGANIZER_USER_ID`/`ONLINE_MEETING_ID` env vars — fine for
a single-meeting deployment, wrong for a real multi-meeting one. **Not yet
wired up**: automatically resolving those two IDs from the Teams meeting
context requires an extra Graph lookup
(`GET /users/{organizerId}/onlineMeetings?$filter=JoinWebUrl eq '...'`)
that isn't built — until it is, a multi-meeting deployment needs them
registered by some other means (e.g. an admin script) before Activate/
Complete will PATCH the correct meeting.

## Provisioning: how judges/hearings/parties actually get into a meeting

The tab is a **management dashboard for hearing data that already
exists** — it has no "add a judge" or "create a hearing" screen. Per §1's
own premise ("initial roles... assigned by another system"), that data
comes from the court's case-management system (the "CMS"), one of two
ways: the CMS pushes it to us on demand (this section), or we pull it from
the CMS on a daily schedule (next section, "Daily case-management
import"). Both end up calling the same underlying upsert
(`backend/src/services/importHearingData.ts`), so they share every
idempotency rule below.

```
POST /api/meetings/:meetingId/provision
Header: X-Api-Key: <one of PROVISIONING_API_KEYS>
Body: {
  "organizerUserId"?: string,
  "onlineMeetingId"?: string,
  "judges"?: [{ "emails": string[], "name": string, "externalUid"?: string,
                "role": "JUDGE" | "PRESIDING_JUDGE" | "SECRETARY" | "OTHER_OFFICER" }],
  "hearings"?: [{ "hearingNumber": number,
                  "expectedParties"?: [{ "name": string, "emails": string[], "externalUid"?: string,
                                          "role"?: "PARTY" | "COUNSEL" | "WITNESS" | "OTHER" }] }]
}
```

(`backend/src/routes/provision.ts`, guarded by
`backend/src/auth/requireProvisioningKey.ts` — a separate, simpler
mechanism from Teams SSO, since the caller here is a server, not a
signed-in Teams user; comma-separated `PROVISIONING_API_KEYS` in
`backend/.env` for key rotation.) Judges are upserted, matched by
`externalUid` (falls back to a synthetic key derived from their first
email if omitted — `backend/src/util/identity.ts` — so a manual re-post is
still idempotent). Hearings are create-only — a `hearingNumber` that
already exists in the meeting is **skipped**, reported back in the
response's `hearingsSkipped`, rather than overwritten, because an existing
hearing's `ExpectedParty` rows may already be referenced by a
`RemapMapping` mid-hearing. Example:

```
curl -X POST https://<backend>/api/meetings/<meetingId>/provision \
  -H 'Content-Type: application/json' -H 'X-Api-Key: <key>' \
  -d '{"judges": [...], "hearings": [...]}'
```

`PROVISIONING_API_KEYS` unset (the default) disables the endpoint (503).
Separately, `POST /api/meetings/:meetingId/register` (`routes/meetings.ts`)
is a lighter-weight Teams-SSO-authenticated endpoint the tab itself calls
on startup — it only creates the bare `Meeting` row so hearings can exist
before any roster event has happened; it is not how judges/hearings get
populated.

### Multi-email matching

A person can have more than one known email (a work alias, a personal
M365 account) — `JudgeOrAuxiliary.emails` / `ExpectedParty.emails` are
arrays, not a single field, and **joining Teams with ANY of them counts as
present/connected**, not just the first
(`backend/src/services/statusDerivation.ts`,
`services/presenterRules.ts`). This matters for the Graph role PATCH too:
`graph/roleManager.ts` promotes whichever literal email they actually
connected with, not their "primary" one — a judge who normally shows up as
`judge@court.gov` but joins one day as `alternative@court.gov` still gets
presenter rights. The first email in the array is used only for display
and as the messaging/mute/camera-off target
(`PartyPresence.email`/`JudgeView.email` in the API — see
`services/stateSnapshot.ts`).

## Daily case-management import (pull)

The backend also PULLS from the CMS on a schedule, rather than waiting for
it to push — `backend/src/services/dailyImportScheduler.ts` fires once a
day (`DAILY_IMPORT_HOUR`, server-local time) and fetches **tomorrow's**
hearings:

```
GET {CMS_BASE_URL}/hearings?date=YYYY-MM-DD
Authorization: Bearer {CMS_API_KEY}
```

expecting rows shaped like:

```
MeetingID, Date, Time, HearingNumber, PersonUID, PersonRole, PersonName, Email
```

where `Email` may be a single string (one row per email — duplicate rows
sharing the same `PersonUID`+`PersonRole` are expected and collapsed) or a
JSON array (no duplication needed) — `backend/src/services/cmsImport.ts`'s
`parseCmsRows()` handles either shape, grouping flat rows into one person
per `(PersonUID, PersonRole)` pair with every email collected. A person
mapped to a judge role becomes meeting-scoped (matches
`JudgeOrAuxiliary`); mapped to a party role, hearing-scoped under that row's
`HearingNumber`. The **MeetingID from the CMS is used directly as this
app's `Meeting.id`** (the same primary key the bot/tab already use, per
docs "Multi-meeting" above) — assumed to be the same identifier Teams
itself will report for that meeting, not a separate scheduling ID needing
reconciliation.

**Role vocabulary is a seeded guess, not confirmed.** `CMS_ROLE_MAPPING`
(`services/cmsImport.ts`) maps `PersonRole` strings (`"Judge"`, `"Party"`,
`"Counsel"`, etc.) to our `JudgeRole`/`PartyRole` enums — it's one flat,
easy-to-extend table; add a key the moment real CMS data shows a role
string that isn't there yet. An unmapped role logs a warning and falls
back to party/`OTHER` (never judge, since that would wrongly hand out
presenter rights to someone of unconfirmed role) rather than silently
dropping the person.

`CMS_MODE=mock` (the default) returns a small built-in sample instead of
calling a real system — `backend/src/services/cmsClient.ts` — so the whole
fetch → parse → upsert pipeline is exercisable today. Set
`CMS_BASE_URL`/`CMS_API_KEY` and `CMS_MODE=real` once there's an actual
system to point at; if it doesn't use simple Bearer-token auth, adjust
`cmsClient.ts`'s `fetchHearingsForDate()`.

`POST /api/admin/run-daily-import` (`routes/admin.ts`, guarded by the same
`requireProvisioningKey`/`PROVISIONING_API_KEYS` as provisioning — this is
another server-to-server action, not a Teams user one) fires the exact
same import immediately, for ops/testing, without waiting for the
scheduled hour:

```
curl -X POST https://<backend>/api/admin/run-daily-import -H 'X-Api-Key: <key>'
```

Each meeting in a day's feed is imported independently — one meeting's bad
data doesn't block the rest, and failures come back per-meeting in the
response's `errors`.

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

## Presence-based mic/camera permissions

Who's promoted to presenter in the Graph role PATCH is computed by
`backend/src/services/presenterRules.ts` (pure, unit-tested in
`presenterRules.test.ts`), used by `graph/roleManager.ts`'s
`syncMeetingRoles()`:

- **Judges/auxiliaries** — always presenter while connected, regardless of
  which hearing (if any) is active.
- **The active hearing's currently-present expected parties** (+ anyone
  remapped into it) — everyone else, including parties of any *other*
  hearing, defaults to attendee.
- **Anyone with an active `PresenterGrant`** — an explicit, persisted
  override (`routes/grants.ts`, `POST /grants` / `POST /grants/:id/revoke`)
  for someone who wouldn't otherwise qualify, e.g. a general-public
  observer staff wants to let speak. Shown in the tab's General public
  section as a "Grant mic/camera" / "Revoke" toggle.

`syncMeetingRoles()` runs on every roster join/leave (`routes/roster.ts`,
`bot/index.ts`), not just Activate/Complete/Reactivate — a judge joining
mid-session becomes presenter immediately.

**Only one hearing can be `ACTIVE` at a time.** Activating a second hearing
while one is already active is rejected (409) rather than silently
swapping — see `graph/roleManager.ts`'s `activateHearing`/
`reactivateHearing`. The tab spotlights the (at most one) active hearing
outside the Ready/Incomplete/No-show groups entirely
(`tab/src/components/HearingsSection.tsx`).

**Mute / camera-off are a separate, weaker lever than the role PATCH.**
Demoting someone to attendee only changes their *ability to self-unmute
going forward* (Teams' standard "only organizers/presenters can turn on
mic" meeting option) — it can't instantly cut off someone already
unmuted. Actually forcing that requires Microsoft's real-time Cloud
Communications/Calls API, the same prerequisite already deferred for
Calling (build-order item 8 below). `routes/participants.ts`'s
mute/camera-off buttons are wired up and mocked under `GRAPH_MODE=mock`
(`graph/client.ts`'s `muteParticipant`/`setParticipantCamera`) so the UI
and audit trail exist now; real mode throws until that Calls API
prerequisite is actually in place.

## Personal, per-hearing notes

`HearingNote` (`backend/prisma/schema.prisma`) is one row per
(hearing, author) — never a single shared field. `GET /api/meetings/:id/notes`
returns only the calling user's own notes; `PUT .../hearings/:id/notes`
only ever upserts the caller's own row. The shared state snapshot pushed
over the socket (`services/stateSnapshot.ts`) **never includes notes at
all** — that's deliberate, not an oversight, since including them in a
room-wide broadcast would leak every author's notes to everyone watching
that meeting. The tab fetches its own notes once via REST
(`tab/src/App.tsx`) and keeps them in local state.

One tension worth knowing about: the full note text still goes into
`AuditLogEntry` (`routes/notes.ts`) for the judiciary record, per docs §7
("this data may need to hold up as a record of how a hearing was actually
conducted") — even though the live UI never shows it to anyone but its
author. That's intentional, not a leak: there's no audit-log-viewing UI in
the tab today, so nothing currently exposes it.

## Session-end summaries

`POST /api/meetings/:meetingId/end-session` (`routes/session.ts`) sends
every judge/auxiliary in the meeting ONE personalized message
(`services/sessionSummary.ts`) summarizing every hearing's final state —
attendance plus, per hearing, **only that recipient's own note**, never
another author's. For a `COMPLETED` hearing, attendance comes from the
frozen snapshot `graph/roleManager.ts`'s `completeHearing()` stores on the
`hearing.complete` audit entry at the moment it closed (not recomputed
live, which can drift as people leave the call afterward); a hearing still
`PENDING`/`ACTIVE` when the session ends falls back to live attendance,
labeled as such. Fires once — `meeting.endedAt` blocks a second call with
409. Triggered from the tab via the "End session & send summaries" button
(confirm-before-firing, since it notifies people and can't be undone).

## Internationalization

The tab and the backend-generated session-summary text both go through a
small `t(key, vars?)` translation lookup rather than hardcoding English
strings inline — **Spanish is the only locale today, and it's the
default**, not a placeholder waiting on a language picker:

- `tab/src/i18n/es.ts` + `index.ts` — every UI string in the tab (labels,
  button text, placeholders, banners, confirm dialogs). Components import
  `t` and call e.g. `t("hearingCard.setActive")` or
  `t("hearingCard.number", { number: 12 })` for interpolated strings
  (`{name}`-style placeholders).
- `backend/src/i18n/es.ts` + `index.ts` — the session-closure summary
  message text (`services/sessionSummary.ts`) sent to judges/auxiliaries —
  real user-facing content, just not rendered in the tab, so it needed the
  same treatment.
- **Backend errors carry a stable `code`, never a hardcoded sentence.**
  E.g. activating a second hearing while one's already active
  (`graph/roleManager.ts`'s `AlreadyActiveHearingError`) comes back as
  `{ code: "ALREADY_ACTIVE", hearingNumber: N }` (`routes/hearings.ts`'s
  `respondError`), and the tab's `api.ts` throws a typed `ApiError`
  carrying that code. `HearingCard.tsx`'s `describeApiError()` maps it to
  `t("errors.ALREADY_ACTIVE", {...})`, falling back to
  `t("errors.GENERIC")` for anything without a translated code — the
  backend's internal error text never reaches the user directly.

**Adding a second locale later** (documented in both `i18n/index.ts`
files): create `<code>.ts` with the exact same key set as `es.ts`
(TypeScript's `keyof typeof es` flags any missing/extra key), register it
in `DICTIONARIES`, and wire up a way to choose it — e.g. reading Teams'
own locale from `teamsContext.ts`'s `app.getContext()`, or a manual
picker. Every call site already goes through `t()`, so nothing else in
the app changes.

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
Teams meeting or a real Entra app registration. Every route is scoped
under `/api/meetings/:meetingId/...` — pick any string as your test
meeting's id, register it once, then pass `x-actor-email` on each call and
`POST /api/meetings/:meetingId/roster/event`
(`{ email, displayName, type: "joined" | "left" }`) to simulate join/leave:

```
curl -X POST http://localhost:3978/api/meetings/test-meeting-1/register \
  -H 'Content-Type: application/json' -H 'x-actor-email: judge1@court.gov' -d '{}'

curl -X POST http://localhost:3978/api/meetings/test-meeting-1/hearings \
  -H 'Content-Type: application/json' -H 'x-actor-email: judge1@court.gov' \
  -d '{"hearingNumber": 12, "expectedParties": [...]}'
```

and the usual `/api/meetings/:meetingId/hearings/:id/{activate,complete,
reactivate}` / `/remap` / `/messages` endpoints, same header. Try two
different `:meetingId` values side by side to see the isolation described
above — hearings, roster, and state pushes never cross between them. See
`backend/src/services/statusDerivation.test.ts` for the attendance-status
rules exercised as unit tests (`npx vitest run`).

### Tab

```
cd tab
npm install
npm run dev                  # http://localhost:53000
```

Outside of a real Teams meeting, open it directly in a browser with
`?actorEmail=judge1@court.gov&meetingId=test-meeting-1` to simulate being
signed in as that judge in that meeting — this skips both real SSO token
acquisition and real meeting-context resolution (`tab/src/teamsContext.ts`)
and sends `x-actor-email` instead, so the backend must also be running with
`AUTH_MODE=dev-bypass` for this to work. Without `?meetingId=`, the tab
shows an explicit error rather than a blank dashboard — see App.tsx.

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
   Per-participant mute/camera-off (`routes/participants.ts`) share this
   exact prerequisite — the buttons and mocked plumbing exist (see
   "Presence-based mic/camera permissions" above), real enforcement doesn't
   yet.
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
