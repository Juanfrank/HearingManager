import type { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { buildStateSnapshot } from "./services/stateSnapshot";
import { verifyBearerToken, isDevBypass } from "./auth/verifyTeamsToken";
import { isMeetingMember } from "./auth/requireMeetingMembership";

let io: SocketIOServer | null = null;
// rosterStale is per-meeting: one meeting's bot losing its roster
// connection has nothing to do with any other concurrent meeting's state.
const rosterStaleByMeeting = new Map<string, boolean>();

function meetingRoom(meetingId: string) {
  return `meeting:${meetingId}`;
}

export function initWs(httpServer: HttpServer, corsOrigin: string) {
  io = new SocketIOServer(httpServer, {
    cors: { origin: corsOrigin },
  });

  // Same identity check as REST (auth/verifyTeamsToken.ts) — the pushed
  // state includes participant names/emails, so an unauthenticated socket
  // would leak PII even though it can't mutate anything. meetingId is
  // required from every client regardless of auth mode — see
  // tab/src/socket.ts for how it's resolved (Teams meeting context).
  //
  // Also checks meeting MEMBERSHIP, not just identity — an authenticated
  // token only proves "a real signed-in user of this app," not "one of
  // THIS meeting's judges/auxiliaries" (this API/tab is staff-only by
  // product decision — parties and general public are tracked, never
  // granted access). Without this, any signed-in user could connect with
  // an arbitrary meetingId and receive that meeting's live participant
  // PII. See auth/requireMeetingMembership.ts for the same check applied
  // to REST routes.
  io.use((socket, next) => {
    const meetingId = socket.handshake.auth?.meetingId as string | undefined;
    if (!meetingId) return next(new Error("missing meetingId"));
    socket.data.meetingId = meetingId;

    if (isDevBypass()) return next();
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error("missing auth token"));
    verifyBearerToken(token)
      .then(async (email) => {
        socket.data.actorEmail = email;
        if (!(await isMeetingMember(meetingId, email))) {
          return next(new Error("not authorized for this meeting"));
        }
        next();
      })
      .catch((err: Error) => next(err));
  });

  io.on("connection", async (socket) => {
    const meetingId = socket.data.meetingId as string;
    socket.join(meetingRoom(meetingId));
    socket.emit("state", await buildStateSnapshot(meetingId, rosterStaleByMeeting.get(meetingId) ?? false));
  });

  return io;
}

/** Recompute and push the full snapshot to every tab watching this meeting. */
export async function broadcastState(meetingId: string) {
  if (!io) return;
  const snapshot = await buildStateSnapshot(meetingId, rosterStaleByMeeting.get(meetingId) ?? false);
  io.to(meetingRoom(meetingId)).emit("state", snapshot);
}

/**
 * docs §7 resilience: if the bot's Graph/roster connection drops mid-
 * hearing, mark that meeting's state stale rather than silently showing
 * outdated presence — scoped so one meeting's bot trouble doesn't flag
 * every other concurrent meeting as stale too.
 */
export function setRosterStale(meetingId: string, stale: boolean) {
  rosterStaleByMeeting.set(meetingId, stale);
  void broadcastState(meetingId);
}
