import { prisma } from "../db";
import { deriveHearingAttendance } from "../services/statusDerivation";
import { computePresenterEmails } from "../services/presenterRules";
import { patchMeetingRoles, type AttendeeRole } from "./client";
import { logAudit } from "../services/auditLog";

/**
 * A stable, machine-readable error — carries a `code` + structured details
 * instead of a hardcoded English sentence, so the tab can render it in
 * whatever language it's showing (tab/src/i18n) rather than displaying
 * this message directly. routes/hearings.ts maps this to a 409.
 */
export class AlreadyActiveHearingError extends Error {
  code = "ALREADY_ACTIVE" as const;
  constructor(public hearingNumber: number) {
    super(`Hearing #${hearingNumber} is already active`);
  }
}

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
 * Builds the FULL authoritative attendee-role map for one Meeting and
 * PATCHes it. Presenter eligibility itself is computed by the pure,
 * unit-tested computePresenterEmails() (services/presenterRules.ts) —
 * connected judges/auxiliaries always, the active hearing's present
 * parties, and anyone with an active PresenterGrant. Rebuilding the whole
 * map from scratch every time — rather than tracking a partial diff — is
 * what keeps the "never a partial diff" guarantee in docs §5.2 easy to
 * reason about. Scoping every query by meetingId is what keeps two
 * concurrent meetings' role maps from ever being computed from each
 * other's roster.
 */
async function buildFullAttendeeRoleMap(meetingId: string): Promise<AttendeeRole[]> {
  const [roster, judges, activeHearing, grants] = await Promise.all([
    prisma.rosterEntry.findMany({ where: { meetingId, isConnected: true } }),
    prisma.judgeOrAuxiliary.findMany({ where: { meetingId } }),
    prisma.hearing.findFirst({
      where: { meetingId, state: "ACTIVE" },
      include: { expectedParties: true },
    }),
    prisma.presenterGrant.findMany({ where: { meetingId, revokedAt: null } }),
  ]);

  let activeHearingPresentEmails: string[] = [];
  if (activeHearing) {
    const remaps = await prisma.remapMapping.findMany({
      where: { hearingId: activeHearing.id, undoneAt: null },
    });
    const connectedRosterEmails = new Set(roster.map((r) => r.email.toLowerCase()));
    // NOT attendance.parties[].email (that's just the display email — the
    // first of a party's possibly-several known emails). A party present
    // via their SECOND email needs THAT literal email promoted, since the
    // final role map below is built by walking actual roster entries —
    // promoting only their unconnected primary email would leave the
    // roster entry they're actually connected as still stuck at attendee.
    for (const party of activeHearing.expectedParties) {
      for (const email of party.emails) {
        if (connectedRosterEmails.has(email.toLowerCase())) {
          activeHearingPresentEmails.push(email);
        }
      }
    }
    // Remapped-in roster entries that are connected also get promoted,
    // even if the remap target hasn't been reflected as an ExpectedParty
    // row (e.g. mapped_to_type = new_party without a persisted party yet).
    for (const m of remaps) {
      activeHearingPresentEmails.push(m.rosterEmail);
    }
  }

  const presenterEmails = computePresenterEmails({
    connectedEmails: roster.map((r) => r.email),
    judges,
    activeHearingPresentEmails,
    activeGrants: grants,
  });

  return roster.map((r) => ({
    email: r.email,
    role: presenterEmails.has(r.email.toLowerCase()) ? "presenter" : "attendee",
  }));
}

/**
 * Recomputes and re-PATCHes the full role map for a meeting's CURRENT
 * state (whichever hearing is active, if any, plus current roster/grants)
 * — the one place role sync happens. Call this after anything that could
 * change who should be presenter: activate/complete/reactivate (below), a
 * roster join/leave (routes/roster.ts, bot/index.ts), or a grant/revoke
 * (routes/grants.ts).
 */
export async function syncMeetingRoles(meetingId: string): Promise<AttendeeRole[]> {
  const { organizerUserId, onlineMeetingId } = await resolveGraphMeetingRef(meetingId);
  const fullMap = await buildFullAttendeeRoleMap(meetingId);
  await patchMeetingRoles(organizerUserId, onlineMeetingId, fullMap);
  return fullMap;
}

export async function activateHearing(
  meetingId: string,
  hearingId: string,
  actorEmail: string,
) {
  const hearing = await prisma.hearing.findFirstOrThrow({
    where: { id: hearingId, meetingId },
  });

  // Only one hearing can be presenter-active at a time (docs/README.md —
  // the spotlight UI and the role map both assume this). Block rather than
  // silently demoting whatever's currently active.
  const alreadyActive = await prisma.hearing.findFirst({
    where: { meetingId, state: "ACTIVE", NOT: { id: hearingId } },
  });
  if (alreadyActive) {
    throw new AlreadyActiveHearingError(alreadyActive.hearingNumber);
  }

  const before = { state: hearing.state };

  const [, period] = await prisma.$transaction([
    prisma.hearing.update({ where: { id: hearingId }, data: { state: "ACTIVE" } }),
    prisma.hearingPeriod.create({ data: { hearingId } }),
  ]);

  const fullMap = await syncMeetingRoles(meetingId);

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
    include: { expectedParties: true },
  });
  const before = { state: hearing.state };

  // Snapshot attendance AT CLOSURE into the audit entry — the session
  // summary (services/sessionSummary.ts) reads this back later rather than
  // recomputing live attendance, which can drift as people leave the call
  // after the hearing itself has already closed. Consistent with "this
  // data may need to hold up as a record" (docs/README.md §7).
  const [roster, remaps] = await Promise.all([
    prisma.rosterEntry.findMany({ where: { meetingId } }),
    prisma.remapMapping.findMany({ where: { hearingId, undoneAt: null } }),
  ]);
  const attendanceAtClose = deriveHearingAttendance(
    hearingId,
    hearing.expectedParties,
    roster,
    remaps,
  );

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

  // No hearing is active any more now — demote everyone back to attendee
  // except judges/auxiliaries and anyone with a standing grant.
  await syncMeetingRoles(meetingId);

  await logAudit({
    meetingId,
    hearingId,
    actorEmail,
    action: "hearing.complete",
    before,
    after: {
      state: "COMPLETED",
      closedPeriodId: openPeriod?.id ?? null,
      attendanceAtClose,
    },
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

  const alreadyActive = await prisma.hearing.findFirst({
    where: { meetingId, state: "ACTIVE", NOT: { id: hearingId } },
  });
  if (alreadyActive) {
    throw new AlreadyActiveHearingError(alreadyActive.hearingNumber);
  }

  const before = { state: hearing.state };

  const [, period] = await prisma.$transaction([
    prisma.hearing.update({ where: { id: hearingId }, data: { state: "ACTIVE" } }),
    prisma.hearingPeriod.create({ data: { hearingId } }),
  ]);

  await syncMeetingRoles(meetingId);

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
