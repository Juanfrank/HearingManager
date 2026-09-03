import { prisma } from "../db";
import { deriveHearingAttendance } from "../services/statusDerivation";
import { patchMeetingRoles, type AttendeeRole } from "./client";
import { logAudit } from "../services/auditLog";

// Fallback for a meeting whose Meeting row hasn't had organizerUserId/
// onlineMeetingId resolved yet (see routes/meetings.ts) — lets a single-
// meeting deployment keep working exactly as before without registering
// anything. A multi-meeting deployment should register every Meeting.
const FALLBACK_ORGANIZER_USER_ID = process.env.ORGANIZER_USER_ID ?? "";
const FALLBACK_ONLINE_MEETING_ID = process.env.ONLINE_MEETING_ID ?? "";

async function resolveGraphMeetingRef(meetingId: string) {
  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
  return {
    organizerUserId: meeting?.organizerUserId || FALLBACK_ORGANIZER_USER_ID,
    onlineMeetingId: meeting?.onlineMeetingId || FALLBACK_ONLINE_MEETING_ID,
  };
}

/**
 * Builds the FULL authoritative attendee-role map for one Meeting: every
 * currently-connected participant across every hearing IN THAT MEETING,
 * with the ACTIVE hearing's connected (incl. remapped) members promoted to
 * presenter and everyone else left as attendee. Rebuilding this from
 * scratch every time — rather than tracking a partial diff — is what keeps
 * the "never a partial diff" guarantee in docs §5.2 easy to reason about.
 * Scoping by meetingId is what keeps two concurrent meetings' role maps
 * from ever being computed from each other's roster.
 */
async function buildFullAttendeeRoleMap(
  meetingId: string,
  presenterHearingId: string | null,
): Promise<AttendeeRole[]> {
  const [roster, hearings, remaps] = await Promise.all([
    prisma.rosterEntry.findMany({ where: { meetingId, isConnected: true } }),
    prisma.hearing.findMany({ where: { meetingId }, include: { expectedParties: true } }),
    prisma.remapMapping.findMany({ where: { undoneAt: null, hearing: { meetingId } } }),
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

export async function activateHearing(
  meetingId: string,
  hearingId: string,
  actorEmail: string,
) {
  const hearing = await prisma.hearing.findFirstOrThrow({
    where: { id: hearingId, meetingId },
  });
  const before = { state: hearing.state };

  const { organizerUserId, onlineMeetingId } = await resolveGraphMeetingRef(meetingId);
  const fullMap = await buildFullAttendeeRoleMap(meetingId, hearingId);
  await patchMeetingRoles(organizerUserId, onlineMeetingId, fullMap);

  const [, period] = await prisma.$transaction([
    prisma.hearing.update({ where: { id: hearingId }, data: { state: "ACTIVE" } }),
    prisma.hearingPeriod.create({ data: { hearingId } }),
  ]);

  await logAudit({
    meetingId,
    hearingId,
    actorEmail,
    action: "hearing.activate",
    before,
    after: { state: "ACTIVE", periodId: period.id, attendeeRoleMap: fullMap },
  });

  return period;
}

export async function completeHearing(
  meetingId: string,
  hearingId: string,
  actorEmail: string,
) {
  const hearing = await prisma.hearing.findFirstOrThrow({
    where: { id: hearingId, meetingId },
  });
  const before = { state: hearing.state };

  // Demote everyone back to attendee (no hearing is presenter now).
  const { organizerUserId, onlineMeetingId } = await resolveGraphMeetingRef(meetingId);
  const fullMap = await buildFullAttendeeRoleMap(meetingId, null);
  await patchMeetingRoles(organizerUserId, onlineMeetingId, fullMap);

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
    meetingId,
    hearingId,
    actorEmail,
    action: "hearing.complete",
    before,
    after: { state: "COMPLETED", closedPeriodId: openPeriod?.id ?? null },
  });
}

export async function reactivateHearing(
  meetingId: string,
  hearingId: string,
  actorEmail: string,
) {
  const hearing = await prisma.hearing.findFirstOrThrow({
    where: { id: hearingId, meetingId },
  });
  const before = { state: hearing.state };

  const { organizerUserId, onlineMeetingId } = await resolveGraphMeetingRef(meetingId);
  const fullMap = await buildFullAttendeeRoleMap(meetingId, hearingId);
  await patchMeetingRoles(organizerUserId, onlineMeetingId, fullMap);

  const [, period] = await prisma.$transaction([
    prisma.hearing.update({ where: { id: hearingId }, data: { state: "ACTIVE" } }),
    prisma.hearingPeriod.create({ data: { hearingId } }),
  ]);

  await logAudit({
    meetingId,
    hearingId,
    actorEmail,
    action: "hearing.reactivate",
    before,
    after: { state: "ACTIVE", newPeriodId: period.id },
  });

  return period;
}
