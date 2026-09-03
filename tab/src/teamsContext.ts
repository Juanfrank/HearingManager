import * as microsoftTeams from "@microsoft/teams-js";

/**
 * Resolves the signed-in user's email via Teams SSO context so the
 * Judges/Auxiliaries panel can distinguish "you" (docs §6). Falls back to
 * a dev query param (?actorEmail=) when not running inside Teams, so the
 * tab is still exercisable standalone during local development.
 */
export async function getCurrentUserEmail(): Promise<string> {
  const devOverride = new URLSearchParams(window.location.search).get("actorEmail");
  if (devOverride) return devOverride.toLowerCase();

  try {
    await microsoftTeams.app.initialize();
    const context = await microsoftTeams.app.getContext();
    const email = context.user?.userPrincipalName ?? context.user?.loginHint;
    if (email) return email.toLowerCase();
  } catch {
    // Not running inside Teams (e.g. local dev in a plain browser tab).
  }
  return "unknown@local";
}
