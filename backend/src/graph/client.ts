/**
 * Thin wrapper around Microsoft Graph. Every call goes through here so we
 * have one place to apply 429/Retry-After backoff (docs §7) and one place
 * to short-circuit into a mock when GRAPH_MODE=mock — which is the default
 * until the Entra ID app registration in docs §3 actually exists.
 */

const GRAPH_MODE = process.env.GRAPH_MODE ?? "mock";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export interface AttendeeRole {
  email: string;
  role: "presenter" | "attendee";
}

export class GraphThrottleError extends Error {
  constructor(public retryAfterSeconds: number) {
    super(`Graph throttled, retry after ${retryAfterSeconds}s`);
  }
}

async function withBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts = 4,
): Promise<T> {
  let attempt = 0;
  let delayMs = 500;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      const isThrottle = err instanceof GraphThrottleError;
      if (!isThrottle || attempt >= maxAttempts) throw err;
      const waitMs = isThrottle
        ? (err as GraphThrottleError).retryAfterSeconds * 1000
        : delayMs;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      delayMs *= 2;
    }
  }
}

async function getAccessToken(): Promise<string> {
  // Real implementation: client-credentials (app-only) or on-behalf-of flow
  // against MICROSOFT_APP_ID / MICROSOFT_APP_PASSWORD / MICROSOFT_APP_TENANT_ID.
  // Left unimplemented in mock mode; wire up MSAL here once the Entra app
  // registration (docs §3) exists.
  throw new Error(
    "getAccessToken() called with GRAPH_MODE=real but no token acquisition is wired up yet",
  );
}

/**
 * PATCH /users/{organizerId}/onlineMeetings/{meetingId}
 * Sets the FULL attendee-role map in one call (docs §5.2 — never a partial
 * diff, or you risk silently reverting another hearing's active group).
 */
export async function patchMeetingRoles(
  organizerUserId: string,
  meetingId: string,
  fullAttendeeRoleMap: AttendeeRole[],
): Promise<{ ok: true; mocked: boolean }> {
  if (GRAPH_MODE === "mock") {
    console.log(
      `[graph:mock] PATCH /users/${organizerUserId}/onlineMeetings/${meetingId}`,
      { allowedPresenters: "roleIsPresenter", attendees: fullAttendeeRoleMap },
    );
    return { ok: true, mocked: true };
  }

  return withBackoff(async () => {
    const token = await getAccessToken();
    const res = await fetch(
      `${GRAPH_BASE}/users/${organizerUserId}/onlineMeetings/${meetingId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          allowedPresenters: "roleIsPresenter",
          participants: {
            attendees: fullAttendeeRoleMap.map((a) => ({
              identity: { user: { id: a.email } },
              role: a.role,
            })),
          },
        }),
      },
    );

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("Retry-After") ?? "5");
      throw new GraphThrottleError(retryAfter);
    }
    if (!res.ok) {
      throw new Error(`Graph PATCH failed: ${res.status} ${await res.text()}`);
    }
    return { ok: true, mocked: false };
  });
}

/**
 * Force-mute / force-camera-off for a SPECIFIC currently-connected
 * participant, right now. This is NOT the same lever as patchMeetingRoles
 * above — the role PATCH only grants/revokes the *ability* to unmute
 * yourself going forward (an attendee can't self-unmute per Teams' default
 * meeting option), it can't instantly cut off someone who's already
 * unmuted. Actually forcing that requires Microsoft's real-time Cloud
 * Communications / Calls API (a registered calling bot, Calls.AccessMedia.
 * All) — the SAME real-time-media prerequisite docs/README.md already
 * defers to Phase 2 for the Calling feature. So these two calls are mocked
 * under GRAPH_MODE=mock (like everything else here) and throw in real
 * mode with a comment rather than silently doing nothing — implement them
 * once that Phase 2 prerequisite is actually in place.
 */
export async function muteParticipant(
  meetingId: string,
  participantEmail: string,
): Promise<{ ok: true; mocked: boolean }> {
  if (GRAPH_MODE === "mock") {
    console.log(`[graph:mock] mute participant ${participantEmail} in meeting ${meetingId}`);
    return { ok: true, mocked: true };
  }
  throw new Error(
    "muteParticipant() requires the Cloud Communications/Calls API (Phase 2, see docs/README.md) — not implemented",
  );
}

export async function setParticipantCamera(
  meetingId: string,
  participantEmail: string,
  enabled: boolean,
): Promise<{ ok: true; mocked: boolean }> {
  if (GRAPH_MODE === "mock") {
    console.log(
      `[graph:mock] set camera ${enabled ? "on" : "off"} for ${participantEmail} in meeting ${meetingId}`,
    );
    return { ok: true, mocked: true };
  }
  throw new Error(
    "setParticipantCamera() requires the Cloud Communications/Calls API (Phase 2, see docs/README.md) — not implemented",
  );
}

/**
 * POST /chats/{chat-id}/messages (creating the chat first via
 * POST /users/{id}/chats if none exists yet). docs §5.6.
 */
export async function sendChatMessage(
  toUserEmail: string,
  fromUserEmail: string,
  text: string,
): Promise<{ ok: true; mocked: boolean }> {
  if (GRAPH_MODE === "mock") {
    console.log(`[graph:mock] message ${fromUserEmail} -> ${toUserEmail}: ${text}`);
    return { ok: true, mocked: true };
  }

  return withBackoff(async () => {
    const token = await getAccessToken();
    const chatRes = await fetch(`${GRAPH_BASE}/users/${fromUserEmail}/chats`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chatType: "oneOnOne",
        members: [
          {
            "@odata.type": "#microsoft.graph.aadUserConversationMember",
            roles: ["owner"],
            "user@odata.bind": `https://graph.microsoft.com/v1.0/users('${fromUserEmail}')`,
          },
          {
            "@odata.type": "#microsoft.graph.aadUserConversationMember",
            roles: ["owner"],
            "user@odata.bind": `https://graph.microsoft.com/v1.0/users('${toUserEmail}')`,
          },
        ],
      }),
    });
    if (chatRes.status === 429) {
      throw new GraphThrottleError(Number(chatRes.headers.get("Retry-After") ?? "5"));
    }
    if (!chatRes.ok) {
      throw new Error(`Graph chat create failed: ${chatRes.status}`);
    }
    const chat = (await chatRes.json()) as { id: string };

    const msgRes = await fetch(`${GRAPH_BASE}/chats/${chat.id}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body: { content: text } }),
    });
    if (msgRes.status === 429) {
      throw new GraphThrottleError(Number(msgRes.headers.get("Retry-After") ?? "5"));
    }
    if (!msgRes.ok) {
      throw new Error(`Graph message send failed: ${msgRes.status}`);
    }
    return { ok: true, mocked: false };
  });
}
