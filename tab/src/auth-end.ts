import * as microsoftTeams from "@microsoft/teams-js";

/**
 * AAD's redirect_uri target after auth-start.html's /authorize round
 * trip — this exact URL (https://<TAB_HOSTNAME>/auth-end.html) must be
 * registered as a redirect URI on the Entra app registration (docs
 * §"Azure / Entra ID prerequisites") or AAD will refuse the redirect
 * outright with AADSTS50011, before this page ever runs.
 *
 * Reports success/failure back to whichever tab called
 * `microsoftTeams.authentication.authenticate()` (teamsContext.ts) —
 * `notifySuccess`/`notifyFailure` resolve/reject that call's promise and
 * close this popup. The access token in the URL fragment is never used
 * as a credential itself (see auth-start.ts) — only its presence/absence
 * matters, as the signal that consent was actually granted.
 */
microsoftTeams.app.initialize().then(() => {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const error = hashParams.get("error");
  const accessToken = hashParams.get("access_token");

  if (error) {
    microsoftTeams.authentication.notifyFailure(hashParams.get("error_description") ?? error);
  } else if (accessToken) {
    microsoftTeams.authentication.notifySuccess(accessToken);
  } else {
    microsoftTeams.authentication.notifyFailure("UnexpectedFailure");
  }
});
