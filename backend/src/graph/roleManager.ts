import { prisma } from "../db";
import { deriveHearingAttendance } from "../services/statusDerivation";
import { computePresenterEmails } from "../services/presenterRules";
import { patchMeetingRoles, muteParticipant, setParticipantCamera, type AttendeeRole } from "./client";
import { logAudit } from "../services/auditLog";

// Actor label for audit entries created by the automatic force-mute/
// camera-off below, mirroring services/sessionSummary.ts's
// "system:session-summary" pattern — this isn't attributable to whoever
// triggered the underlying action without threading actorEmail through
// every syncMeetingRoles call site (roster events, grants, activate/
// complete/reactivate/return-to-pending), so it's logged as the system
// instead.
const SYSTEM_DEMOTION_ACTOR = "system:demotion";

// Last-computed presenter set per meeting, kept in memory so
// syncMeetingRoles can tell who just got DEMOTED (was presenter, now
// isn't) without every caller having to pass in the prior state. Reset on
// server restart — acceptable here since force-mute/camera-off is itself
// mocked under GRAPH_MODE=mock and throws in real mode until the Phase-2
// Calls API prerequisite exists (docs/README.md); this cache only feeds
// that same not-yet-real lever.
const lastPresenterEmailsByMeeting = new Map<string, Set<string>>();

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
    prisma.judgeOrAuxiliary.findMany({ where: { meetingId }, include: { emails: true } }),
    prisma.hearing.findFirst({
      where: { meetingId, state: "ACTIVE" },
      include: { expectedParties: { include: { emails: true } } },
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
      for (const { email } of party.emails) {
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
    judges: judges.map((j) => ({ ...j, emails: j.emails.map((e) => e.email) })),
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
 *
 * Also force-mutes and turns off the camera for anyone who just DROPPED
 * from presenter to attendee here — whatever caused it (a hearing marked
 * complete, returned to pending, reactivated elsewhere demoting the
 * previously-active one, or a PresenterGrant revoked). The role PATCH
 * above only blocks them from unmuting again going forward (Teams' "only
 * organizers/presenters can unmute" default) — it can't instantly cut off
 * someone who's already unmuted mid-hearing. Centralizing this HERE,
 * rather than in each caller (activateHearing/completeHearing/etc.),
 * means every demotion gets this treatment regardless of what triggered
 * it, without duplicating the detection logic at every call site.
 */
export async function syncMeetingRoles(meetingId: string): Promise<AttendeeRole[]> {
  const { organizerUserId, onlineMeetingId } = await resolveGraphMeetingRef(meetingId);
  const fullMap = await buildFullAttendeeRoleMap(meetingId);
  await patchMeetingRoles(organizerUserId, onlineMeetingId, fullMap);

  const stillConnectedEmails = new Set(fullMap.map((r) => r.email.toLowerCase()));
  const newPresenterEmails = new Set(
    fullMap.filter((r) => r.role === "presenter").map((r) => r.email.toLowerCase()),
  );
  const previousPresenterEmails = lastPresenterEmailsByMeeting.get(meetingId) ?? new Set<string>();
  const demotedEmails = [...previousPresenterEmails].filter(
    (email) => stillConnectedEmails.has(email) && !newPresenterEmails.has(email),
  );
  lastPresenterEmailsByMeeting.set(meetingId, newPresenterEmails);

  if (demotedEmails.length) {
    await Promise.all(
      demotedEmails.map(async (email) => {
        try {
          await muteParticipant(onlineMeetingId, email);
          await setParticipantCamera(onlineMeetingId, email, false);
          await logAudit({
            meetingId,
            actorEmail: SYSTEM_DEMOTION_ACTOR,
            action: "participant.forceMuteOnDemotion",
            after: { email },
          });
        } catch (err) {
          // Never let a mocked/not-yet-real force-mute failure break the
          // role sync itself — the role PATCH above already succeeded and
          // is the part that actually matters once GRAPH_MODE=real.
          console.error(`[roleManager] force mute/camera-off failed for ${email}`, err);
        }
      }),
    );
  }

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
    include: { expectedParties: { include: { emails: true } } },
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
  const expectedParties = hearing.expectedParties.map((p) => ({
    ...p,
    emails: p.emails.map((e) => e.email),
  }));
  const attendanceAtClose = deriveHearingAttendance(
    hearingId,
    expectedParties,
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

/**
 * Sends a hearing back to the pending bin from ACTIVE or COMPLETED — not a
 * "real" completion (no attendance snapshot is frozen, unlike
 * completeHearing above), just a state reset so staff can re-run it later.
 * No "already active" guard needed here — the opposite direction always
 * frees up the single-active-hearing slot rather than contending for it.
 */
export async function returnHearingToPending(
  meetingId: string,
  hearingId: string,
  actorEmail: string,
) {
  const hearing = await prisma.hearing.findFirstOrThrow({
    where: { id: hearingId, meetingId },
  });
  const before = { state: hearing.state };

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
  await prisma.hearing.update({ where: { id: hearingId }, data: { state: "PENDING" } });

  // This hearing's parties (if any were presenter) drop back to attendee
  // unless a judge/grant still covers them.
  await syncMeetingRoles(meetingId);

  await logAudit({
    meetingId,
    hearingId,
    actorEmail,
    action: "hearing.returnToPending",
    before,
    after: { state: "PENDING", closedPeriodId: openPeriod?.id ?? null },
  });
}
