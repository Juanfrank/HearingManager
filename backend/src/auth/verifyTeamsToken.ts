import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtHeader, type SigningKeyCallback } from "jsonwebtoken";
import jwksClient from "jwks-rsa";

/**
 * Validates the Azure AD access token the tab acquires via Teams SSO
 * (microsoftTeams.authentication.getAuthToken(), see tab/src/teamsContext.ts)
 * and turns it into a trusted req.actorEmail — replacing the old "trust
 * whatever x-actor-email header the client sends" approach, which let
 * anyone attribute audit-log entries to any judge they liked.
 *
 * AUTH_MODE=dev-bypass keeps the old header-trusting behavior for local
 * dev/testing without a real Entra app registration. NEVER set that in
 * production — see docs/README.md.
 */
const AUTH_MODE = process.env.AUTH_MODE ?? "teams-sso";
const MICROSOFT_APP_ID = process.env.MICROSOFT_APP_ID ?? "";
const TAB_HOSTNAME = process.env.TAB_HOSTNAME ?? "";
const EXPECTED_TENANT_ID = process.env.MICROSOFT_APP_TENANT_ID ?? "";

// A token minted for this app's exposed API has an audience of either the
// bare App ID or the App ID URI (api://<hostname>/<appId>) depending on how
// the client requested it — accept either.
const EXPECTED_AUDIENCES = [MICROSOFT_APP_ID, `api://${TAB_HOSTNAME}/${MICROSOFT_APP_ID}`].filter(
  Boolean,
);

// Fail CLOSED at startup, not open at request time: without MICROSOFT_APP_ID
// (and, since the JWKS endpoint below is the multi-tenant "common" one,
// MICROSOFT_APP_TENANT_ID too) EXPECTED_AUDIENCES/EXPECTED_TENANT_ID end up
// empty, and verifyBearerToken's checks below used to silently skip
// validating either one — meaning a misconfigured deployment would accept
// ANY validly-signed Azure AD token from ANY app in ANY tenant as a
// legitimate actor. Refusing to even start is the safe failure mode for a
// security check this central.
if (AUTH_MODE !== "dev-bypass") {
  if (!MICROSOFT_APP_ID) {
    throw new Error(
      "AUTH_MODE=teams-sso requires MICROSOFT_APP_ID to be set — refusing to start with token audience validation silently disabled (auth/verifyTeamsToken.ts). Set AUTH_MODE=dev-bypass for local dev without a real Entra app registration instead.",
    );
  }
  if (!EXPECTED_TENANT_ID) {
    throw new Error(
      "AUTH_MODE=teams-sso requires MICROSOFT_APP_TENANT_ID to be set — refusing to start with token tenant validation silently disabled (auth/verifyTeamsToken.ts). Set AUTH_MODE=dev-bypass for local dev without a real Entra app registration instead.",
    );
  }
}

const jwks = jwksClient({
  // v2.0 endpoint, multi-tenant-safe key set; we still pin the tenant via
  // the token's own `tid` claim below rather than trusting the endpoint.
  jwksUri: "https://login.microsoftonline.com/common/discovery/v2.0/keys",
  cache: true,
  cacheMaxAge: 12 * 60 * 60 * 1000,
  rateLimit: true,
});

function getSigningKey(header: JwtHeader, callback: SigningKeyCallback) {
  jwks.getSigningKey(header.kid, (err, key) => {
    if (err || !key) return callback(err ?? new Error("no signing key"));
    callback(null, key.getPublicKey());
  });
}

export interface AuthedRequest extends Request {
  actorEmail?: string;
}

/**
 * Core token verification, shared by the Express middleware below and by
 * ws.ts's Socket.IO handshake auth (the socket carries participant PII —
 * names, emails — so it needs the same check, not just the REST routes).
 * Resolves to the verified user's email, or rejects.
 */
export function verifyBearerToken(token: string): Promise<string> {
  return new Promise((resolve, reject) => {
    jwt.verify(token, getSigningKey, { algorithms: ["RS256"] }, (err, decoded) => {
      if (err || !decoded || typeof decoded === "string") {
        return reject(new Error(`invalid token: ${err?.message ?? "unparseable"}`));
      }
      // Unconditional, not "only if configured" — the module-level throw
      // above should already prevent ever reaching here with either list
      // empty, but this is the actual security boundary; it must never
      // silently pass just because a config value came back empty.
      if (!EXPECTED_AUDIENCES.length || !EXPECTED_AUDIENCES.includes(decoded.aud as string)) {
        return reject(new Error("token audience does not match this app"));
      }
      if (!EXPECTED_TENANT_ID || decoded.tid !== EXPECTED_TENANT_ID) {
        return reject(new Error("token issued for a different tenant"));
      }
      const email = (
        (decoded.preferred_username || decoded.upn || decoded.email) as string | undefined
      )?.toLowerCase();
      if (!email) {
        return reject(new Error("token has no preferred_username/upn/email claim"));
      }
      resolve(email);
    });
  });
}

export function isDevBypass(): boolean {
  return AUTH_MODE === "dev-bypass";
}

export function requireTeamsUser(req: AuthedRequest, res: Response, next: NextFunction) {
  if (isDevBypass()) {
    req.actorEmail = (
      req.header("x-actor-email") ||
      req.body?.actorEmail ||
      "unknown@local"
    ).toLowerCase();
    return next();
  }

  const match = (req.header("authorization") || "").match(/^Bearer (.+)$/i);
  if (!match) {
    return res.status(401).json({ error: "missing Authorization: Bearer <token> header" });
  }

  verifyBearerToken(match[1])
    .then((email) => {
      req.actorEmail = email;
      next();
    })
    .catch((err: Error) => res.status(401).json({ error: err.message }));
}
