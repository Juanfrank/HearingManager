const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:3978/api";

let currentActorEmail = "unknown@local";
export function setActorEmail(email: string) {
  currentActorEmail = email;
}

async function request(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-actor-email": currentActorEmail,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${init?.method ?? "GET"} ${path} failed: ${res.status} ${body}`);
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  getState: () => request("/state"),
  activateHearing: (id: string) => request(`/hearings/${id}/activate`, { method: "POST" }),
  completeHearing: (id: string) => request(`/hearings/${id}/complete`, { method: "POST" }),
  reactivateHearing: (id: string) => request(`/hearings/${id}/reactivate`, { method: "POST" }),
  updateNotes: (id: string, notes: string) =>
    request(`/hearings/${id}/notes`, { method: "PATCH", body: JSON.stringify({ notes }) }),
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
};
