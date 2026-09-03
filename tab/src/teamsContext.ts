import * as microsoftTeams from "@microsoft/teams-js";

let initialized: Promise<boolean> | null = null;

/** Initializes the Teams JS SDK exactly once; resolves false outside Teams. */
function ensureInitialized(): Promise<boolean> {
  if (!initialized) {
    initialized = microsoftTeams.app
      .initialize()
      .then(() => true)
      .catch(() => false);
  }
  return initialized;
}

/**
 * Resolves the signed-in user's email via Teams SSO context, for display
 * only (e.g. highlighting "you" in the Judges panel, docs §6). This is
 * NOT an authentication mechanism — the backend never trusts this value;
 * see getAuthToken() below for the real credential every API call carries.
 */
export async function getCurrentUserEmail(): Promise<string> {
  const devOverride = new URLSearchParams(window.location.search).get("actorEmail");
  if (devOverride) return devOverride.toLowerCase();

  if (await ensureInitialized()) {
    try {
      const context = await microsoftTeams.app.getContext();
      const email = context.user?.userPrincipalName ?? context.user?.loginHint;
      if (email) return email.toLowerCase();
    } catch {
      // fall through
    }
  }
  return "unknown@local";
}

/**
 * Real Teams SSO: acquires an Azure AD access token for this app (audience
 * = the App ID registered in manifest.json's webApplicationInfo) via the
 * Teams client, which — because the tenant admin has already consented to
 * this app (docs §3, "Delegated permission consent") — succeeds silently,
 * no popup, no password prompt. That token is what
 * backend/src/auth/verifyTeamsToken.ts verifies and turns into a trusted
 * actor identity for the audit log.
 *
 * Requests a fresh token on every call rather than caching it here — the
 * Teams SDK keeps its own short-lived cache and handles silent refresh, so
 * this stays correct across long-lived tab sessions without extra code.
 *
 * NOTE: this only covers the *silent* SSO path, which is what a tenant
 * that has done org-wide admin consent gets by default. If consent is
 * per-user and hasn't been granted yet, getAuthToken() rejects with
 * resourceRequiresConsent / invalid_grant and there is currently no
 * interactive-consent (authentication.authenticate popup) fallback wired
 * up — see docs/README.md's Teams SSO section.
 */
export async function getAuthToken(): Promise<string | null> {
  const devOverride = new URLSearchParams(window.location.search).get("actorEmail");
  if (devOverride) return null; // dev-bypass path in api.ts uses the header instead

  if (!(await ensureInitialized())) return null;

  try {
    return await microsoftTeams.authentication.getAuthToken();
  } catch (err) {
    console.error("[teams-sso] getAuthToken failed", err);
    return null;
  }
}

let cachedMeetingId: string | null = null;

/**
 * Resolves the CURRENT Teams meeting's id — the tenant boundary every
 * backend route and the socket connection are scoped by (see
 * backend/prisma/schema.prisma's Meeting model and docs/README.md). This
 * is the same id Teams hands the bot on every activity
 * (activity.conversation.id, backend/src/bot/index.ts), so a tab and the
 * bot serving the same live meeting always agree on which Meeting row to
 * use without either side having to look anything up.
 *
 * Cached for the tab's lifetime — unlike the auth token, the meeting a tab
 * instance is running in never changes underneath it.
 */
export async function getMeetingId(): Promise<string | null> {
  if (cachedMeetingId) return cachedMeetingId;

  const devOverride = new URLSearchParams(window.location.search).get("meetingId");
  if (devOverride) {
    cachedMeetingId = devOverride;
    return cachedMeetingId;
  }

  if (await ensureInitialized()) {
    try {
      const context = await microsoftTeams.app.getContext();
      if (context.meeting?.id) {
        cachedMeetingId = context.meeting.id;
        return cachedMeetingId;
      }
    } catch {
      // fall through
    }
  }
  return null;
}
