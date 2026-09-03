import { meetingIdParam } from "../util/params";
import { Router } from "express";
import { prisma } from "../db";

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
 */
meetingsRouter.post("/register", async (req, res) => {
  const { organizerUserId, onlineMeetingId } = req.body as {
    organizerUserId?: string;
    onlineMeetingId?: string;
  };

  const meeting = await prisma.meeting.upsert({
    where: { id: meetingIdParam(req) },
    create: {
      id: meetingIdParam(req),
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
