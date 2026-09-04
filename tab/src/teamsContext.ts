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

// Substrings seen in the error Teams/AAD raises when a token can't be
// issued silently because the user (or the tenant) hasn't consented to
// this app's access_as_user scope yet — as opposed to some other failure
// (network, misconfiguration) that retrying with a popup won't fix.
// Teams JS's exact error shape has varied across versions/hosts, so this
// matches by substring against whatever message/name comes back rather
// than a single exact string.
const CONSENT_REQUIRED_PATTERNS = [
  "resourceRequiresConsent",
  "invalid_grant",
  "consent_required",
  "interaction_required",
  "CancelledByUser", // still worth one interactive attempt — see below
];

function isConsentRequiredError(err: unknown): boolean {
  const text = `${err instanceof Error ? err.name : ""} ${err instanceof Error ? err.message : String(err)}`;
  return CONSENT_REQUIRED_PATTERNS.some((pattern) => text.includes(pattern));
}

// api.ts calls getAuthToken() on every request and socket.ts on every
// (re)connect — without this, a user who dismisses/declines the consent
// popup once would get it thrown back in their face on their very next
// click. Once an interactive attempt has failed in this tab session,
// stop offering it again; every call just falls back to null (dev-bypass-
// style unauthenticated, which the backend will 401) until they reload.
let interactiveConsentFailedThisSession = false;

/**
 * Real Teams SSO: acquires an Azure AD access token for this app (audience
 * = the App ID registered in manifest.json's webApplicationInfo) via the
 * Teams client. That token is what backend/src/auth/verifyTeamsToken.ts
 * verifies and turns into a trusted actor identity for the audit log.
 *
 * Requests a fresh token on every call rather than caching it here — the
 * Teams SDK keeps its own short-lived cache and handles silent refresh, so
 * this stays correct across long-lived tab sessions without extra code.
 *
 * Tries the SILENT path first — what a tenant that's done org-wide admin
 * consent (docs §3) gets for free, no popup, no password prompt. When
 * that's not the case (consent is per-user and this user hasn't granted
 * it yet), the silent call rejects with a consent-required error; rather
 * than giving up, this falls back to
 * `microsoftTeams.authentication.authenticate()` — a popup that loads
 * auth-start.html, which redirects to Microsoft's own consent prompt, and
 * auth-end.html, which reports the result back here. Once the user
 * consents there, the SILENT call is retried once and should now succeed
 * — so this deployment never has to rely on admin consent having been
 * done ahead of time.
 */
export async function getAuthToken(): Promise<string | null> {
  const devOverride = new URLSearchParams(window.location.search).get("actorEmail");
  if (devOverride) return null; // dev-bypass path in api.ts uses the header instead

  if (!(await ensureInitialized())) return null;

  try {
    return await microsoftTeams.authentication.getAuthToken();
  } catch (err) {
    if (!isConsentRequiredError(err) || interactiveConsentFailedThisSession) {
      console.error("[teams-sso] getAuthToken failed", err);
      return null;
    }

    console.warn(
      "[teams-sso] silent token acquisition needs consent — opening the interactive consent popup",
      err,
    );
    try {
      await microsoftTeams.authentication.authenticate({
        url: `${window.location.origin}/auth-start.html`,
        width: 600,
        height: 535,
      });
    } catch (consentErr) {
      interactiveConsentFailedThisSession = true;
      console.error("[teams-sso] interactive consent failed or was cancelled", consentErr);
      return null;
    }

    try {
      return await microsoftTeams.authentication.getAuthToken();
    } catch (retryErr) {
      console.error("[teams-sso] getAuthToken still failing after consent was granted", retryErr);
      return null;
    }
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
