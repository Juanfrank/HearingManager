import type { NextFunction, Request, Response } from "express";

/**
 * Auth for the server-to-server provisioning endpoint (routes/provision.ts)
 * — a real case-management system pushing judges/hearings/expected-parties
 * ahead of a hearing day has no Teams user to sign in as, so
 * requireTeamsUser (auth/verifyTeamsToken.ts) doesn't apply here; this is a
 * deliberately separate, simpler mechanism.
 *
 * PROVISIONING_API_KEYS is a comma-separated list rather than a single key
 * so a key can be rotated by adding the new one, updating the calling
 * system, then removing the old one — without a window where nothing
 * validates. There is no per-integration scoping or expiry here; if this
 * app ends up integrating with more than one external system, replace this
 * with a real ApiKey table (hashed keys, one row per integration, revocable
 * individually) rather than stretching this env var further.
 */
const VALID_KEYS = new Set(
  (process.env.PROVISIONING_API_KEYS ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean),
);

export function requireProvisioningKey(req: Request, res: Response, next: NextFunction) {
  if (VALID_KEYS.size === 0) {
    return res.status(503).json({
      error: "provisioning API is not configured (PROVISIONING_API_KEYS is unset)",
    });
  }

  const key = req.header("x-api-key");
  if (!key || !VALID_KEYS.has(key)) {
    return res.status(401).json({ error: "missing or invalid X-Api-Key" });
  }

  next();
}
