import { io, Socket } from "socket.io-client";
import type { StateSnapshot } from "./types";

const SOCKET_BASE = import.meta.env.VITE_SOCKET_BASE ?? "http://localhost:3978";

let socket: Socket | null = null;

/**
 * docs §5.1: the tab is pushed updates over the socket, it never polls the
 * backend. onState fires once immediately on connect (server sends the
 * current snapshot) and again on every subsequent state change.
 */
export function subscribeToState(onState: (snapshot: StateSnapshot) => void): () => void {
  socket = io(SOCKET_BASE, { transports: ["websocket"] });
  socket.on("state", onState);
  return () => {
    socket?.off("state", onState);
    socket?.disconnect();
    socket = null;
  };
}
