import * as microsoftTeams from "@microsoft/teams-js";

/**
 * Loaded ONLY inside the popup window Teams opens for
 * `microsoftTeams.authentication.authenticate()` — teamsContext.ts's
 * `getAuthToken()` falls back to that popup when the normal silent SSO
 * call rejects with a consent-required error, which happens whenever the
 * tenant hasn't done org-wide admin consent for this app's
 * `access_as_user` scope ahead of time and this particular user hasn't
 * consented individually yet either (docs/README.md, "Auth: Teams SSO" —
 * this is what closes that "Known gap").
 *
 * This page's only job is to redirect to the Microsoft identity
 * platform's /authorize endpoint, requesting THIS APP'S OWN
 * `access_as_user` scope, so the user gets a real Microsoft consent
 * prompt. The access token this flow itself obtains is discarded —
 * auth-end.html (the redirect target) just reports success/failure back
 * to the tab that opened this popup. Once consent is recorded by AAD,
 * teamsContext.ts's normal SILENT `getAuthToken()` call succeeds on
 * retry — that's the token actually used for API calls, not anything
 * obtained here.
 */

const APP_ID = import.meta.env.VITE_MICROSOFT_APP_ID as string | undefined;
const TENANT_ID = (import.meta.env.VITE_MICROSOFT_APP_TENANT_ID as string | undefined) || "organizations";
// Same App ID URI manifest.json's webApplicationInfo.resource declares —
// override via VITE_APP_ID_URI if it ever needs to differ from the
// straightforward api://<this host>/<App ID> default.
const RESOURCE =
  (import.meta.env.VITE_APP_ID_URI as string | undefined) ||
  (APP_ID ? `api://${window.location.host}/${APP_ID}` : undefined);

function randomString(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

microsoftTeams.app.initialize().then(async () => {
  if (!APP_ID || !RESOURCE) {
    document.body.textContent =
      "Falta configurar VITE_MICROSOFT_APP_ID al compilar el tab (ver tab/.env.example).";
    return;
  }

  // Pre-fills the account picker when Teams knows who's signed in — purely
  // a UX nicety, the flow still works without it.
  let loginHint = "";
  try {
    const context = await microsoftTeams.app.getContext();
    loginHint = context.user?.loginHint ?? context.user?.userPrincipalName ?? "";
  } catch {
    // proceed without a hint
  }

  const params = new URLSearchParams({
    client_id: APP_ID,
    response_type: "token",
    response_mode: "fragment",
    scope: `${RESOURCE}/access_as_user openid profile`,
    redirect_uri: `${window.location.origin}/auth-end.html`,
    nonce: randomString(),
    state: randomString(),
  });
  if (loginHint) params.set("login_hint", loginHint);

  window.location.assign(
    `https://login.microsoftonline.com/${encodeURIComponent(TENANT_ID)}/oauth2/v2.0/authorize?${params.toString()}`,
  );
});
