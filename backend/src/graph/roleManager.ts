import { prisma } from "../db";
import { deriveHearingAttendance } from "../services/statusDerivation";
import { patchMeetingRoles, type AttendeeRole } from "./client";
import { logAudit } from "../services/auditLog";

const ORGANIZER_USER_ID = process.env.ORGANIZER_USER_ID ?? "";
const ONLINE_MEETING_ID = process.env.ONLINE_MEETING_ID ?? "";

/**
 * Builds the FULL authoritative attendee-role map for the meeting: every
 * currently-connected participant across every hearing, with the ACTIVE
 * hearing's connected (incl. remapped) members promoted to presenter and
 * everyone else left as attendee. Rebuilding this from scratch every time
 * — rather than tracking a partial diff — is what keeps the "never a
 * partial diff" guarantee in docs §5.2 easy to reason about.
 */
async function buildFullAttendeeRoleMap(
  presenterHearingId: string | null,
): Promise<AttendeeRole[]> {
  const [roster, hearings, remaps] = await Promise.all([
    prisma.rosterEntry.findMany({ where: { isConnected: true } }),
    prisma.hearing.findMany({ include: { expectedParties: true } }),
    prisma.remapMapping.findMany({ where: { undoneAt: null } }),
  ]);

  const presenterEmails = new Set<string>();
  if (presenterHearingId) {
    const activeHearing = hearings.find((h) => h.id === presenterHearingId);
    if (activeHearing) {
      const attendance = deriveHearingAttendance(
        activeHearing.id,
        activeHearing.expectedParties,
        roster,
        remaps,
      );
      for (const p of attendance.parties) {
        if (p.present) presenterEmails.add(p.email.toLowerCase());
      }
      // Remapped-in roster entries that are connected also get promoted,
      // even if the remap target hasn't been reflected as an ExpectedParty
      // row (e.g. mapped_to_type = new_party without a persisted party yet).
      for (const m of remaps) {
        if (m.hearingId === activeHearing.id) {
          presenterEmails.add(m.rosterEmail.toLowerCase());
        }
      }
    }
  }

  return roster.map((r) => ({
    email: r.email,
    role: presenterEmails.has(r.email.toLowerCase()) ? "presenter" : "attendee",
  }));
}

export async function activateHearing(hearingId: string, actorEmail: string) {
  const hearing = await prisma.hearing.findUniqueOrThrow({
    where: { id: hearingId },
  });
  const before = { state: hearing.state };

  const fullMap = await buildFullAttendeeRoleMap(hearingId);
  await patchMeetingRoles(ORGANIZER_USER_ID, ONLINE_MEETING_ID, fullMap);

  const [, period] = await prisma.$transaction([
    prisma.hearing.update({ where: { id: hearingId }, data: { state: "ACTIVE" } }),
    prisma.hearingPeriod.create({ data: { hearingId } }),
  ]);

  await logAudit({
    hearingId,
    actorEmail,
    action: "hearing.activate",
    before,
    after: { state: "ACTIVE", periodId: period.id, attendeeRoleMap: fullMap },
  });

  return period;
}

export async function completeHearing(hearingId: string, actorEmail: string) {
  const hearing = await prisma.hearing.findUniqueOrThrow({
    where: { id: hearingId },
  });
  const before = { state: hearing.state };

  // Demote everyone back to attendee (no hearing is presenter now).
  const fullMap = await buildFullAttendeeRoleMap(null);
  await patchMeetingRoles(ORGANIZER_USER_ID, ONLINE_MEETING_ID, fullMap);

  const openPeriod = await prisma.hearingPeriod.findFirst({
    where: { hearingId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });
  if (openPeriod) {
    await prisma.hearingPeriod.update({
      where: { id: openPeriod.id },
      data: { endedAt: new Date() },
    });
  }
  await prisma.hearing.update({ where: { id: hearingId }, data: { state: "COMPLETED" } });

  await logAudit({
    hearingId,
    actorEmail,
    action: "hearing.complete",
    before,
    after: { state: "COMPLETED", closedPeriodId: openPeriod?.id ?? null },
  });
}

export async function reactivateHearing(hearingId: string, actorEmail: string) {
  const hearing = await prisma.hearing.findUniqueOrThrow({
    where: { id: hearingId },
  });
  const before = { state: hearing.state };

  const fullMap = await buildFullAttendeeRoleMap(hearingId);
  await patchMeetingRoles(ORGANIZER_USER_ID, ONLINE_MEETING_ID, fullMap);

  const [, period] = await prisma.$transaction([
    prisma.hearing.update({ where: { id: hearingId }, data: { state: "ACTIVE" } }),
    prisma.hearingPeriod.create({ data: { hearingId } }),
  ]);

  await logAudit({
    hearingId,
    actorEmail,
    action: "hearing.reactivate",
    before,
    after: { state: "ACTIVE", newPeriodId: period.id },
  });

  return period;
}
