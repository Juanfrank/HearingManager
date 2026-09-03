/**
 * A person's identity key within a meeting/hearing — what
 * @@unique([..., externalUid]) on JudgeOrAuxiliary/ExpectedParty actually
 * matches re-imports and re-upserts against (prisma/schema.prisma). Real
 * case-management-system UIDs (services/cmsImport.ts) use this directly;
 * manually-entered people (routes/judges.ts, routes/parties.ts) have no
 * such UID, so one is derived deterministically from their first email
 * instead — this is what keeps a manual POST idempotent (re-posting the
 * same person updates them instead of creating a duplicate), the same
 * guarantee the old singular-email unique constraint used to provide.
 */
export function externalUidOrSynthetic(
  externalUid: string | null | undefined,
  primaryEmail: string,
): string {
  return externalUid?.trim() || `email:${primaryEmail.trim().toLowerCase()}`;
}
