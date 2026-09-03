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

const app = express();
const PORT = Number(process.env.PORT ?? 3978);
const TAB_ORIGIN = process.env.TAB_ORIGIN ?? "http://localhost:53000";

app.use(cors({ origin: TAB_ORIGIN }));
app.use(express.json());

app.get("/api/state", async (_req, res) => {
  res.json(await buildStateSnapshot(false));
});

app.use("/api/hearings", hearingsRouter);
app.use("/api/parties", partiesRouter);
app.use("/api/roster", rosterRouter);
app.use("/api/judges", judgesRouter);
app.use("/api/remap", remapRouter);
app.use("/api/messages", messagesRouter);

// Bot Framework endpoint. Real credentials come from MICROSOFT_APP_ID /
// MICROSOFT_APP_PASSWORD / MICROSOFT_APP_TENANT_ID (docs §3) — until the
// Entra registration exists this simply won't authenticate, which is fine
// for local dev where roster events are driven via POST /api/roster/event.
const botFrameworkAuth = new ConfigurationBotFrameworkAuthentication({
  MicrosoftAppId: process.env.MICROSOFT_APP_ID,
  MicrosoftAppPassword: process.env.MICROSOFT_APP_PASSWORD,
  MicrosoftAppTenantId: process.env.MICROSOFT_APP_TENANT_ID,
} as any);
const adapter = new CloudAdapter(botFrameworkAuth);
const bot = new HearingRosterBot();

app.post("/api/messages/teams", (req, res) => {
  adapter.process(req, res, (context) => bot.run(context));
});

const httpServer = http.createServer(app);
initWs(httpServer, TAB_ORIGIN);

httpServer.listen(PORT, () => {
  console.log(`Hearing Manager backend listening on :${PORT}`);
  console.log(`GRAPH_MODE=${process.env.GRAPH_MODE ?? "mock"}`);
});
