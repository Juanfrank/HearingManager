import { io, Socket } from "socket.io-client";
import type { StateSnapshot } from "./types";
import { getAuthToken } from "./teamsContext";

const SOCKET_BASE = import.meta.env.VITE_SOCKET_BASE ?? "http://localhost:3978";

let socket: Socket | null = null;

function devActorEmailOverride(): string | null {
  return new URLSearchParams(window.location.search).get("actorEmail");
}

/**
 * docs §5.1: the tab is pushed updates over the socket, it never polls the
 * backend. onState fires once immediately on connect (server sends the
 * current snapshot) and again on every subsequent state change.
 *
 * The socket carries the same Teams-SSO token as REST calls (see
 * backend/src/ws.ts's handshake auth) — pushed state includes participant
 * names/emails, so it needs the same identity check as the API.
 */
export async function subscribeToState(
  onState: (snapshot: StateSnapshot) => void,
): Promise<() => void> {
  const token = await getAuthToken();
  const devEmail = devActorEmailOverride();

  socket = io(SOCKET_BASE, {
    transports: ["websocket"],
    auth: token ? { token } : devEmail ? { devActorEmail: devEmail } : {},
  });
  socket.on("state", onState);
  return () => {
    socket?.off("state", onState);
    socket?.disconnect();
    socket = null;
  };
}
