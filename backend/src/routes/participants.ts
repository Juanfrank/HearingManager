import { Router } from "express";
import { muteParticipant, setParticipantCamera } from "../graph/client";
import { logAudit } from "../services/auditLog";
import { meetingIdParam } from "../util/params";
import type { AuthedRequest } from "../auth/verifyTeamsToken";

// mergeParams: mounted under /api/meetings/:meetingId (index.ts).
export const participantsRouter = Router({ mergeParams: true });

function actorEmail(req: import("express").Request): string {
  return (req as AuthedRequest).actorEmail ?? "unknown@local";
}

/**
 * Momentary mute/camera-off for a specific connected participant. Unlike
 * routes/grants.ts, this has NO persisted state — it's a one-shot action
 * (mocked under GRAPH_MODE=mock, see graph/client.ts's muteParticipant/
 * setParticipantCamera for why real-mode isn't implemented here yet:
 * it needs the same Phase-2 Calls API the original build already deferred
 * for Calling).
 */
participantsRouter.post("/participants/:email/mute", async (req, res) => {
  const meetingId = meetingIdParam(req);
  const email = decodeURIComponent(req.params.email);
  try {
    const result = await muteParticipant(meetingId, email);
    await logAudit({
      meetingId,
      actorEmail: actorEmail(req),
      action: "participant.mute",
      after: { email, mocked: result.mocked },
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

participantsRouter.post("/participants/:email/camera", async (req, res) => {
  const meetingId = meetingIdParam(req);
  const email = decodeURIComponent(req.params.email);
  const { enabled } = req.body as { enabled: boolean };
  try {
    const result = await setParticipantCamera(meetingId, email, Boolean(enabled));
    await logAudit({
      meetingId,
      actorEmail: actorEmail(req),
      action: "participant.camera",
      after: { email, enabled: Boolean(enabled), mocked: result.mocked },
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
