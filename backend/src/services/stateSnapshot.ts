import { prisma } from "../db";
import {
  deriveHearingAttendance,
  generalPublicEntries,
} from "./statusDerivation";

/**
 * The single state payload pushed to the tab over the socket (docs §5.1 —
 * the tab is never expected to poll). Also served over
 * GET /api/meetings/:meetingId/state for initial load / reconnect. Scoped
 * to one Meeting (the tenant boundary — see prisma/schema.prisma) so
 * concurrent hearings in different Teams meetings never mix.
 */
export async function buildStateSnapshot(meetingId: string, rosterStale: boolean) {
  const [judges, hearings, roster, remaps] = await Promise.all([
    prisma.judgeOrAuxiliary.findMany({ where: { meetingId }, orderBy: { role: "asc" } }),
    prisma.hearing.findMany({
      where: { meetingId },
      include: { expectedParties: true, periods: { orderBy: { startedAt: "asc" } } },
      orderBy: { hearingNumber: "asc" },
    }),
    prisma.rosterEntry.findMany({ where: { meetingId } }),
    // RemapMapping has no meetingId of its own — it's scoped transitively
    // through hearingId, which is itself meeting-scoped, so filtering
    // hearings by meetingId above is sufficient; this just fetches remaps
    // for exactly those hearings.
    prisma.remapMapping.findMany({
      where: { hearing: { meetingId } },
      include: { mappedToExpectedParty: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const hearingViews = hearings.map((h) => {
    const attendance = deriveHearingAttendance(
      h.id,
      h.expectedParties,
      roster,
      remaps,
    );
    const hearingRemaps = remaps.filter((m) => m.hearingId === h.id);
    const activePeriod = h.periods.find((p) => !p.endedAt) ?? null;
    return {
      id: h.id,
      hearingNumber: h.hearingNumber,
      state: h.state, // PENDING | ACTIVE | COMPLETED (explicit lifecycle)
      attendanceStatus: attendance.status, // ready | incomplete | no_show (derived)
      presentCount: attendance.presentCount,
      expectedCount: attendance.expectedCount,
      notes: h.notes,
      parties: attendance.parties,
      periods: h.periods.map((p) => ({
        id: p.id,
        startedAt: p.startedAt,
        endedAt: p.endedAt,
      })),
      activePeriodStartedAt: activePeriod?.startedAt ?? null,
      remaps: hearingRemaps.map((m) => ({
        id: m.id,
        rosterEmail: m.rosterEmail,
        mappedToType: m.mappedToType,
        mappedToExpectedPartyName: m.mappedToExpectedParty?.name ?? null,
        newPartyName: m.newPartyName,
        undoneAt: m.undoneAt,
      })),
    };
  });

  const generalPublic = generalPublicEntries(
    roster,
    hearings.flatMap((h) => h.expectedParties),
    remaps,
  ).map((r) => ({ email: r.email, displayName: (r as any).displayName }));

  // Struck-through/disabled entries: connected roster rows with an active
  // remap, shown in general public referencing which hearing they moved to
  // (docs §5.5), separate from the still-interactive unresolved ones above.
  const remappedIntoHearing = remaps
    .filter((m) => !m.undoneAt)
    .map((m) => ({
      email: m.rosterEmail,
      hearingId: m.hearingId,
      remapId: m.id,
    }));

  return {
    meetingId,
    generatedAt: new Date().toISOString(),
    rosterStale,
    judges,
    hearings: hearingViews,
    generalPublic,
    remappedIntoHearing,
  };
}
