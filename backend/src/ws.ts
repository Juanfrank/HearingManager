import type { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { buildStateSnapshot } from "./services/stateSnapshot";
import { verifyBearerToken, isDevBypass } from "./auth/verifyTeamsToken";

let io: SocketIOServer | null = null;
let rosterStale = false;

export function initWs(httpServer: HttpServer, corsOrigin: string) {
  io = new SocketIOServer(httpServer, {
    cors: { origin: corsOrigin },
  });

  // Same identity check as REST (auth/verifyTeamsToken.ts) — the pushed
  // state includes participant names/emails, so an unauthenticated socket
  // would leak PII even though it can't mutate anything.
  io.use((socket, next) => {
    if (isDevBypass()) return next();
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error("missing auth token"));
    verifyBearerToken(token)
      .then(() => next())
      .catch((err: Error) => next(err));
  });

  io.on("connection", async (socket) => {
    socket.emit("state", await buildStateSnapshot(rosterStale));
  });

  return io;
}

/** Recompute and push the full snapshot to every connected tab. */
export async function broadcastState() {
  if (!io) return;
  const snapshot = await buildStateSnapshot(rosterStale);
  io.emit("state", snapshot);
}

/**
 * docs §7 resilience: if the bot's Graph/roster connection drops mid-
 * hearing, mark state stale rather than silently showing outdated presence.
 */
export function setRosterStale(stale: boolean) {
  rosterStale = stale;
  void broadcastState();
}
