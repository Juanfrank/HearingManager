/**
 * Who gets promoted to presenter (mic/camera rights) in the Graph role
 * PATCH. Pure and unit-tested (see presenterRules.test.ts) — the same
 * pattern as statusDerivation.ts — so the actual authorization logic is
 * checked independently of Prisma/Graph plumbing.
 *
 * Presenter = connected judges/auxiliaries (ALWAYS, regardless of which
 * hearing — if any — is active) ∪ the active hearing's currently-present
 * expected parties (+ anyone remapped into it) ∪ anyone with an active,
 * un-revoked PresenterGrant. Everyone else connected is attendee — general
 * public by default, and parties of any hearing that ISN'T the active one.
 */

export interface ConnectedEmailLike {
  email: string;
  isConnected: boolean;
}

export interface JudgeLike {
  email: string;
}

export interface PresenterGrantLike {
  email: string;
  revokedAt: Date | null;
}

const norm = (email: string) => email.trim().toLowerCase();

export function computePresenterEmails(params: {
  connectedEmails: string[];
  judges: JudgeLike[];
  activeHearingPresentEmails: string[];
  activeGrants: PresenterGrantLike[];
}): Set<string> {
  const connected = new Set(params.connectedEmails.map(norm));
  const presenters = new Set<string>();

  for (const j of params.judges) {
    const email = norm(j.email);
    if (connected.has(email)) presenters.add(email);
  }

  for (const email of params.activeHearingPresentEmails) {
    presenters.add(norm(email));
  }

  for (const g of params.activeGrants) {
    if (g.revokedAt) continue;
    const email = norm(g.email);
    if (connected.has(email)) presenters.add(email);
  }

  return presenters;
}
