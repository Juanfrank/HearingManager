import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";
import { CloudAdapter, ConfigurationBotFrameworkAuthentication } from "botbuilder";
import { hearingsRouter } from "./routes/hearings";
import { partiesRouter } from "./routes/parties";
import { rosterRouter } from "./routes/roster";
import { judgesRouter } from "./routes/judges";
import { remapRouter } from "./routes/remap";
import { messagesRouter } from "./routes/messages";
import { buildStateSnapshot } from "./services/stateSnapshot";
import { initWs } from "./ws";
import { HearingRosterBot } from "./bot";
import { requireTeamsUser } from "./auth/verifyTeamsToken";

const app = express();
const PORT = Number(process.env.PORT ?? 3978);
const TAB_ORIGIN = process.env.TAB_ORIGIN ?? "http://localhost:53000";

app.use(cors({ origin: TAB_ORIGIN }));
app.use(express.json());

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

// Everything else requires a validated Teams-SSO token (or AUTH_MODE=
// dev-bypass locally) — this is what turns req.actorEmail from "whatever
// header the client felt like sending" into something the audit log can
// actually stand behind.
app.use("/api", requireTeamsUser);

app.get("/api/state", async (_req, res) => {
  res.json(await buildStateSnapshot(false));
});

app.use("/api/hearings", hearingsRouter);
app.use("/api/parties", partiesRouter);
app.use("/api/roster", rosterRouter);
app.use("/api/judges", judgesRouter);
app.use("/api/remap", remapRouter);
app.use("/api/messages", messagesRouter);

const httpServer = http.createServer(app);
initWs(httpServer, TAB_ORIGIN);

httpServer.listen(PORT, () => {
  console.log(`Hearing Manager backend listening on :${PORT}`);
  console.log(`GRAPH_MODE=${process.env.GRAPH_MODE ?? "mock"}`);
});
