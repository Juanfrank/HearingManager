import type { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { buildStateSnapshot } from "./services/stateSnapshot";

let io: SocketIOServer | null = null;
let rosterStale = false;

export function initWs(httpServer: HttpServer, corsOrigin: string) {
  io = new SocketIOServer(httpServer, {
    cors: { origin: corsOrigin },
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
