import { Router } from "express";
import { prisma } from "../db";
import { broadcastState } from "../ws";
import { sendSessionSummaries } from "../services/sessionSummary";
import { meetingIdParam } from "../util/params";
import type { AuthedRequest } from "../auth/verifyTeamsToken";

// mergeParams: mounted under /api/meetings/:meetingId (index.ts).
export const sessionRouter = Router({ mergeParams: true });

function actorEmail(req: import("express").Request): string {
  return (req as AuthedRequest).actorEmail ?? "unknown@local";
}

/**
 * "End session": sends every judge/auxiliary a personalized summary of
 * every hearing's final state (services/sessionSummary.ts) and marks the
 * meeting ended. Fires once per meeting — a second call 409s rather than
 * re-sending everyone another round of messages.
 */
sessionRouter.post("/end-session", async (req, res) => {
  const meetingId = meetingIdParam(req);
  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
  if (!meeting) {
    return res.status(404).json({ error: "meeting not found — nothing to end" });
  }
  if (meeting.endedAt) {
    return res.status(409).json({ error: "this session has already ended", endedAt: meeting.endedAt });
  }

  const actor = actorEmail(req);
  const recipients = await sendSessionSummaries(meetingId, actor);

  await prisma.meeting.update({
    where: { id: meetingId },
    data: { endedAt: new Date(), endedBy: actor },
  });

  await broadcastState(meetingId);
  res.json({ ok: true, recipients });
});
