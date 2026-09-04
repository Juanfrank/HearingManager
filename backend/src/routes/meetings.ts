import { meetingIdParam } from "../util/params";
import { Router } from "express";
import { prisma } from "../db";
import { isDevBypass, type AuthedRequest } from "../auth/verifyTeamsToken";
import { isMeetingMember } from "../auth/requireMeetingMembership";

// mergeParams: mounted under /api/meetings/:meetingId (index.ts).
export const meetingsRouter = Router({ mergeParams: true });

/**
 * Idempotent upsert of the Meeting row for :meetingId — the tab calls this
 * once on startup (tab/src/App.tsx) so the Meeting exists even before any
 * roster event has occurred (roster events also upsert it lazily, see
 * routes/roster.ts, but the tab shouldn't have to wait for a participant
 * to join before it can create a Hearing).
 *
 * organizerUserId/onlineMeetingId are optional: without them, Graph role-
 * PATCH calls (graph/roleManager.ts) fall back to the deployment-wide
 * ORGANIZER_USER_ID/ONLINE_MEETING_ID env vars, which is fine for a
 * single-meeting deployment but wrong for a shared multi-meeting one —
 * resolving them automatically from Teams meeting context requires an
 * extra Graph lookup (GET /users/{organizerId}/onlineMeetings?$filter=
 * JoinWebUrl eq '...') that isn't wired up yet; pass them explicitly here
 * once that's built, or register them out-of-band.
 *
 * Deliberately NOT gated behind requireMeetingMembership (index.ts) like
 * the other meeting-scoped routers — this is how the very first
 * legitimate participant bootstraps a brand-new meeting, before any
 * judge/roster row can exist for them yet, so membership can't be a
 * precondition here. Instead: creating a not-yet-existing Meeting row is
 * always allowed (harmless — an empty row with no data), but CHANGING an
 * already-configured meeting's organizerUserId/onlineMeetingId requires
 * the caller to already be a member of it — otherwise an unrelated
 * authenticated user could redirect which Graph meeting future role-PATCH
 * calls target for someone else's session.
 */
meetingsRouter.post("/register", async (req, res) => {
  const meetingId = meetingIdParam(req);
  const { organizerUserId, onlineMeetingId } = req.body as {
    organizerUserId?: string;
    onlineMeetingId?: string;
  };

  const existing = await prisma.meeting.findUnique({ where: { id: meetingId } });

  if (existing && !isDevBypass()) {
    const changingOrganizer =
      (organizerUserId !== undefined && organizerUserId !== existing.organizerUserId) ||
      (onlineMeetingId !== undefined && onlineMeetingId !== existing.onlineMeetingId);
    if (changingOrganizer) {
      const email = (req as AuthedRequest).actorEmail ?? "";
      if (!(await isMeetingMember(meetingId, email))) {
        return res
          .status(403)
          .json({ error: "not authorized to modify this meeting's Graph identifiers" });
      }
    }
  }

  const meeting = await prisma.meeting.upsert({
    where: { id: meetingId },
    create: {
      id: meetingId,
      organizerUserId: organizerUserId ?? null,
      onlineMeetingId: onlineMeetingId ?? null,
    },
    update: {
      ...(organizerUserId !== undefined ? { organizerUserId } : {}),
      ...(onlineMeetingId !== undefined ? { onlineMeetingId } : {}),
    },
  });

  res.status(201).json(meeting);
});
