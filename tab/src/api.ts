import { getAuthToken, getMeetingId } from "./teamsContext";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:3978/api";

// Dev-only fallback: when running outside Teams (no SSO token available),
// ?actorEmail= in the URL is sent as x-actor-email instead — only honored
// by the backend when AUTH_MODE=dev-bypass (see backend/.env.example).
// Never relied on when a real Teams SSO token is available.
function devActorEmailOverride(): string | null {
  return new URLSearchParams(window.location.search).get("actorEmail");
}

/**
 * Every route is scoped under /api/meetings/:meetingId (backend/src/
 * index.ts) — this resolves the current meeting once (teamsContext.ts,
 * cached) and prefixes every request with it, so nothing here needs to
 * remember to pass it explicitly.
 */
async function meetingPath(path: string): Promise<string> {
  const meetingId = await getMeetingId();
  if (!meetingId) {
    throw new Error(
      "no meeting id available — this tab isn't running inside a Teams meeting (or pass ?meetingId= for local dev)",
    );
  }
  return `/meetings/${encodeURIComponent(meetingId)}${path}`;
}

/**
 * A backend error body, shaped {code, ...details} (backend/src/routes/
 * hearings.ts's respondError and friends) — carries a stable machine-
 * readable `code` instead of an English sentence, so the tab can render it
 * via its own translation table (src/i18n) rather than displaying
 * whatever language the backend happened to log in.
 */
export class ApiError extends Error {
  code: string;
  details: Record<string, unknown>;
  constructor(status: number, body: { code?: string; message?: string; [k: string]: unknown }) {
    super(body.message ?? body.code ?? `request failed: ${status}`);
    this.code = body.code ?? "UNKNOWN";
    this.details = body;
  }
}

async function request(path: string, init?: RequestInit) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };

  const token = await getAuthToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  } else {
    const devEmail = devActorEmailOverride();
    if (devEmail) headers["x-actor-email"] = devEmail;
  }

  const scopedPath = await meetingPath(path);
  const res = await fetch(`${API_BASE}${scopedPath}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as Record<string, unknown>);
    throw new ApiError(res.status, body);
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  getState: () => request("/state"),
  /**
   * Idempotent — registers this meeting's Meeting row (routes/meetings.ts)
   * so hearings/judges can be created even before any roster event has
   * happened. Call once on tab startup (App.tsx).
   */
  registerMeeting: (payload?: { organizerUserId?: string; onlineMeetingId?: string }) =>
    request("/register", { method: "POST", body: JSON.stringify(payload ?? {}) }),
  activateHearing: (id: string) => request(`/hearings/${id}/activate`, { method: "POST" }),
  completeHearing: (id: string) => request(`/hearings/${id}/complete`, { method: "POST" }),
  reactivateHearing: (id: string) => request(`/hearings/${id}/reactivate`, { method: "POST" }),
  createRemap: (payload: {
    rosterEmail: string;
    hearingId: string;
    mappedToExpectedPartyId?: string;
    newPartyName?: string;
  }) => request("/remap", { method: "POST", body: JSON.stringify(payload) }),
  undoRemap: (remapId: string) => request(`/remap/${remapId}/undo`, { method: "POST" }),
  sendMessage: (toEmail: string, text: string) =>
    request("/messages", { method: "POST", body: JSON.stringify({ toEmail, text }) }),
  simulateRosterEvent: (email: string, displayName: string, type: "joined" | "left") =>
    request("/roster/event", { method: "POST", body: JSON.stringify({ email, displayName, type }) }),

  /** Personal, per-author notes — see backend/src/routes/notes.ts. */
  getMyNotes: (): Promise<Record<string, string>> => request("/notes"),
  updateMyNotes: (hearingId: string, text: string) =>
    request(`/hearings/${hearingId}/notes`, { method: "PUT", body: JSON.stringify({ text }) }),

  /** Ad-hoc presenter (mic/camera) access — backend/src/routes/grants.ts. */
  grantPresenter: (email: string) =>
    request("/grants", { method: "POST", body: JSON.stringify({ email }) }),
  revokeGrant: (grantId: string) => request(`/grants/${grantId}/revoke`, { method: "POST" }),

  /**
   * One-shot, mocked (GRAPH_MODE=mock) mute/camera-off — see
   * backend/src/routes/participants.ts and graph/client.ts for why real
   * mode isn't implemented yet (needs the Phase-2 Calls API).
   */
  muteParticipant: (email: string) =>
    request(`/participants/${encodeURIComponent(email)}/mute`, { method: "POST" }),
  setParticipantCamera: (email: string, enabled: boolean) =>
    request(`/participants/${encodeURIComponent(email)}/camera`, {
      method: "POST",
      body: JSON.stringify({ enabled }),
    }),

  /** Sends every judge/auxiliary a closure summary — backend/src/routes/session.ts. */
  endSession: () => request("/end-session", { method: "POST" }),
};
