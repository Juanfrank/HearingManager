import { io, Socket } from "socket.io-client";
import type { StateSnapshot } from "./types";
import { getAuthToken, getMeetingId } from "./teamsContext";

// Empty by default — same-origin (see api.ts's API_BASE for why: co-hosted
// in production, proxied by Vite in dev). socket.io-client connects to the
// current page's origin when given no URL at all, so this is passed
// through omitted rather than as "".
const SOCKET_BASE = import.meta.env.VITE_SOCKET_BASE ?? "";

let socket: Socket | null = null;

function devActorEmailOverride(): string | null {
  return new URLSearchParams(window.location.search).get("actorEmail");
}

/**
 * docs §5.1: the tab is pushed updates over the socket, it never polls the
 * backend. onState fires once immediately on connect (server sends the
 * current snapshot, scoped to this meeting) and again on every subsequent
 * state change in that meeting.
 *
 * The socket carries the same meetingId and Teams-SSO token as REST calls
 * (see backend/src/ws.ts's handshake) — the server joins it to a
 * per-meeting room and rejects a connection with no meetingId outright, so
 * two concurrent meetings' tabs never end up in the same broadcast group.
 */
export async function subscribeToState(
  onState: (snapshot: StateSnapshot) => void,
): Promise<() => void> {
  const meetingId = await getMeetingId();
  if (!meetingId) {
    throw new Error(
      "no meeting id available — this tab isn't running inside a Teams meeting (or pass ?meetingId= for local dev)",
    );
  }

  const token = await getAuthToken();
  const devEmail = devActorEmailOverride();

  socket = SOCKET_BASE
    ? io(SOCKET_BASE, {
        transports: ["websocket"],
        auth: {
          meetingId,
          ...(token ? { token } : devEmail ? { devActorEmail: devEmail } : {}),
        },
      })
    : io({
        transports: ["websocket"],
        auth: {
          meetingId,
          ...(token ? { token } : devEmail ? { devActorEmail: devEmail } : {}),
        },
      });
  socket.on("state", onState);
  return () => {
    socket?.off("state", onState);
    socket?.disconnect();
    socket = null;
  };
}
