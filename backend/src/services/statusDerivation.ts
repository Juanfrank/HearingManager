/**
 * Derived hearing status (docs §4, §5.1).
 *
 * `ready` / `incomplete` / `no_show` are NEVER stored — they are computed
 * by joining a hearing's ExpectedParty rows against currently-connected
 * RosterEntry rows, with any active (non-undone) RemapMapping treated as
 * "this roster email counts as present for this hearing." Recompute on
 * every roster event and every remap/undo.
 */

export type DerivedAttendanceStatus = "ready" | "incomplete" | "no_show";

export interface ExpectedPartyLike {
  id: string;
  // A person can have more than one known email (docs/README.md,
  // "Provisioning" / case-management import) — joining Teams with ANY of
  // them counts as present, not just the first.
  emails: string[];
}

export interface RosterEntryLike {
  email: string;
  isConnected: boolean;
}

export interface RemapMappingLike {
  rosterEmail: string;
  hearingId: string;
  undoneAt: Date | null;
}

export interface PartyPresence {
  expectedPartyId: string;
  // Display/messaging email — the first of the party's known emails.
  // present is computed against ALL of them, not just this one.
  email: string;
  present: boolean;
}

export interface DerivedHearingAttendance {
  status: DerivedAttendanceStatus;
  presentCount: number;
  expectedCount: number;
  parties: PartyPresence[];
}

const norm = (email: string) => email.trim().toLowerCase();

/**
 * Connected roster emails, expanded so a remapped roster email also counts
 * as connected for the hearing it was remapped into (docs §5.5: "treat
 * that roster entry as present in the target hearing for status/derivation
 * purposes going forward").
 */
export function connectedEmailsForHearing(
  hearingId: string,
  roster: RosterEntryLike[],
  remaps: RemapMappingLike[],
): Set<string> {
  const connected = new Set(
    roster.filter((r) => r.isConnected).map((r) => norm(r.email)),
  );

  const activeRemapsIntoHearing = remaps.filter(
    (m) => m.hearingId === hearingId && !m.undoneAt,
  );
  for (const m of activeRemapsIntoHearing) {
    // The remapped roster entry only counts as present if it is still
    // actually connected on the live roster.
    if (connected.has(norm(m.rosterEmail))) {
      connected.add(norm(m.rosterEmail));
    }
  }

  return connected;
}

export function deriveHearingAttendance(
  hearingId: string,
  expectedParties: ExpectedPartyLike[],
  roster: RosterEntryLike[],
  remaps: RemapMappingLike[],
): DerivedHearingAttendance {
  const connected = connectedEmailsForHearing(hearingId, roster, remaps);

  const parties: PartyPresence[] = expectedParties.map((p) => ({
    expectedPartyId: p.id,
    email: p.emails[0] ?? "",
    present: p.emails.some((e) => connected.has(norm(e))),
  }));

  const presentCount = parties.filter((p) => p.present).length;
  const expectedCount = parties.length;

  let status: DerivedAttendanceStatus;
  if (expectedCount === 0 || presentCount === 0) {
    status = "no_show";
  } else if (presentCount === expectedCount) {
    status = "ready";
  } else {
    status = "incomplete";
  }

  return { status, presentCount, expectedCount, parties };
}

/**
 * Roster entries connected but not mapped to any hearing's ExpectedParty
 * list and not (actively) remapped anywhere — "General public" (docs §5.5).
 */
export function generalPublicEntries(
  roster: RosterEntryLike[],
  allExpectedParties: ExpectedPartyLike[],
  remaps: RemapMappingLike[],
): RosterEntryLike[] {
  const expectedEmails = new Set(
    allExpectedParties.flatMap((p) => p.emails.map(norm)),
  );
  const activeRemapEmails = new Set(
    remaps.filter((m) => !m.undoneAt).map((m) => norm(m.rosterEmail)),
  );

  return roster.filter((r) => {
    const email = norm(r.email);
    if (expectedEmails.has(email)) return false;
    // Still shown (struck-through/disabled) if remapped — caller decides
    // rendering; here we only decide "unresolved general public" vs not.
    if (activeRemapEmails.has(email)) return false;
    return true;
  });
}
