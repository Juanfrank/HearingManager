import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";
import path from "path";
import fs from "fs";
import { CloudAdapter, ConfigurationBotFrameworkAuthentication } from "botbuilder";
import { hearingsRouter } from "./routes/hearings";
import { partiesRouter } from "./routes/parties";
import { rosterRouter } from "./routes/roster";
import { judgesRouter } from "./routes/judges";
import { remapRouter } from "./routes/remap";
import { messagesRouter } from "./routes/messages";
import { meetingsRouter } from "./routes/meetings";
import { provisionRouter } from "./routes/provision";
import { notesRouter } from "./routes/notes";
import { grantsRouter } from "./routes/grants";
import { participantsRouter } from "./routes/participants";
import { sessionRouter } from "./routes/session";
import { adminRouter } from "./routes/admin";
import { buildStateSnapshot } from "./services/stateSnapshot";
import { initWs } from "./ws";
import { HearingRosterBot } from "./bot";
import { requireTeamsUser } from "./auth/verifyTeamsToken";
import { startDailyImportScheduler } from "./services/dailyImportScheduler";

const app = express();
const PORT = Number(process.env.PORT ?? 3978);
const TAB_ORIGIN = process.env.TAB_ORIGIN ?? "http://localhost:53000";

app.use(cors({ origin: TAB_ORIGIN }));
app.use(express.json());

// Unauthenticated on purpose — Azure App Service (and any other platform
// health probe / "Always On" ping) needs this reachable with no token,
// before requireTeamsUser is mounted below.
app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

// Bot Framework endpoint — registered BEFORE requireTeamsUser below.
// Bot Framework activities carry their own JWT (validated by
// ConfigurationBotFrameworkAuthentication, signed by the Bot Framework
// connector service), not the Teams-SSO user token requireTeamsUser
// expects; mounting the two on the same middleware chain would reject
// every real bot request with 401. Credentials come from MICROSOFT_APP_ID
// / MICROSOFT_APP_PASSWORD / MICROSOFT_APP_TENANT_ID (docs §3) — until the
// Entra registration exists this simply won't authenticate, which is fine
// for local dev where roster events are driven via POST /api/roster/event.
const botFrameworkAuth = new ConfigurationBotFrameworkAuthentication({
  MicrosoftAppId: process.env.MICROSOFT_APP_ID,
  MicrosoftAppPassword: process.env.MICROSOFT_APP_PASSWORD,
  MicrosoftAppTenantId: process.env.MICROSOFT_APP_TENANT_ID,
} as any);
const adapter = new CloudAdapter(botFrameworkAuth);
const bot = new HearingRosterBot();

app.post("/api/messages/teams", async (req, res) => {
  try {
    await adapter.process(req, res, (context) => bot.run(context));
  } catch (err) {
    // adapter.process can throw synchronously (e.g. a malformed/non-Bot-
    // Framework request body) rather than rejecting — left uncaught, that
    // crashes the entire process, taking down every hearing in progress.
    console.error("[bot] adapter.process failed", err);
    if (!res.headersSent) res.status(500).json({ error: "bot processing failed" });
  }
});

// Provisioning endpoint — also registered BEFORE requireTeamsUser, same
// reasoning as the bot endpoint above: the caller is an external
// case-management system (docs/README.md, "Provisioning"), not a
// signed-in Teams user, so it carries its own X-Api-Key check
// (requireProvisioningKey, applied inside provisionRouter itself — see
// routes/provision.ts — not here, so it can only ever guard this one
// exact path and nothing app.use's prefix-matching might otherwise catch).
app.use("/api/meetings/:meetingId/provision", provisionRouter);

// Admin/ops endpoint (manual daily-import trigger) — same reasoning as
// provisioning above, and NOT meeting-scoped (see routes/admin.ts).
app.use("/api/admin", adminRouter);

// Everything else requires a validated Teams-SSO token (or AUTH_MODE=
// dev-bypass locally) — this is what turns req.actorEmail from "whatever
// header the client felt like sending" into something the audit log can
// actually stand behind.
app.use("/api", requireTeamsUser);

app.get("/api/meetings/:meetingId/state", async (req, res) => {
  res.json(await buildStateSnapshot(req.params.meetingId, false));
});

// Every resource is scoped under :meetingId (Teams' own meeting/
// conversation id, resolved by the tab from its meeting context — see
// tab/src/teamsContext.ts) — the tenant boundary that keeps two
// concurrent meetings' hearings/roster/judges from ever mixing. See
// prisma/schema.prisma's Meeting model and routes/meetings.ts for how a
// Meeting row comes to exist in the first place.
app.use("/api/meetings/:meetingId/hearings", hearingsRouter);
app.use("/api/meetings/:meetingId/parties", partiesRouter);
app.use("/api/meetings/:meetingId/roster", rosterRouter);
app.use("/api/meetings/:meetingId/judges", judgesRouter);
app.use("/api/meetings/:meetingId/remap", remapRouter);
app.use("/api/meetings/:meetingId/messages", messagesRouter);
// notes/grants/participants/session define their own leaf paths (e.g.
// GET /notes, POST /grants, POST /participants/:email/mute,
// POST /end-session) rather than each getting their own app.use prefix —
// mounted at the bare :meetingId base alongside meetingsRouter.
app.use("/api/meetings/:meetingId", notesRouter);
app.use("/api/meetings/:meetingId", grantsRouter);
app.use("/api/meetings/:meetingId", participantsRouter);
app.use("/api/meetings/:meetingId", sessionRouter);
app.use("/api/meetings/:meetingId", meetingsRouter);

// Serves the tab's production build (index.html + config.html + assets)
// so ONE deployment — one App Service, one hostname — can host the tab,
// the REST API, the bot messaging endpoint, and Socket.IO together;
// manifest.json's contentUrl/validDomains then only need that single
// hostname. `npm run build` (backend/package.json) builds tab/ and copies
// its output here via scripts/copy-tab-dist.js — this directory doesn't
// exist in a plain `npm run dev` checkout, so serving it is opt-in based
// on whether that build step has actually run, not a hard dependency.
// Mounted after every /api route: Express falls through to a genuine
// 404 for anything under /api that doesn't match, rather than this
// static middleware silently swallowing it.
const TAB_PUBLIC_DIR = path.join(__dirname, "..", "public");
if (fs.existsSync(TAB_PUBLIC_DIR)) {
  app.use(express.static(TAB_PUBLIC_DIR));
} else {
  console.log("[static] backend/public not found — skipping tab static serving (run `npm run build` to produce it)");
}

const httpServer = http.createServer(app);
initWs(httpServer, TAB_ORIGIN);
startDailyImportScheduler();

httpServer.listen(PORT, () => {
  console.log(`Hearing Manager backend listening on :${PORT}`);
  console.log(`GRAPH_MODE=${process.env.GRAPH_MODE ?? "mock"}`);
});
