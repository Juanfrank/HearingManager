import { Router } from "express";
import { prisma } from "../db";
import { broadcastState } from "../ws";
import { logAudit } from "../services/auditLog";
import { syncMeetingRoles } from "../graph/roleManager";
import { meetingIdParam } from "../util/params";
import type { AuthedRequest } from "../auth/verifyTeamsToken";

// mergeParams: mounted under /api/meetings/:meetingId (index.ts).
export const grantsRouter = Router({ mergeParams: true });

function actorEmail(req: import("express").Request): string {
  return (req as AuthedRequest).actorEmail ?? "unknown@local";
}

/**
 * Ad-hoc presenter (mic/camera) access for someone who wouldn't otherwise
 * have it — e.g. a general-public observer staff wants to let speak.
 * Real, persisted state (unlike mute/camera-off, see routes/participants.ts)
 * — it's folded into services/presenterRules.ts and actually changes the
 * next Graph role PATCH.
 */
grantsRouter.post("/grants", async (req, res) => {
  const meetingId = meetingIdParam(req);
  const { email } = req.body as { email: string };
  if (!email) return res.status(400).json({ error: "email is required" });
  const normalized = email.trim().toLowerCase();

  const existing = await prisma.presenterGrant.findFirst({
    where: { meetingId, email: normalized, revokedAt: null },
  });
  const grant =
    existing ??
    (await prisma.presenterGrant.create({
      data: { meetingId, email: normalized, grantedBy: actorEmail(req) },
    }));

  if (!existing) {
    await logAudit({
      meetingId,
      actorEmail: actorEmail(req),
      action: "presenterGrant.create",
      after: grant,
    });
  }

  await syncMeetingRoles(meetingId);
  await broadcastState(meetingId);
  res.status(201).json(grant);
});

grantsRouter.post("/grants/:id/revoke", async (req, res) => {
  const meetingId = meetingIdParam(req);
  const before = await prisma.presenterGrant.findFirst({
    where: { id: req.params.id, meetingId },
  });
  if (!before) {
    return res.status(404).json({ error: "grant not found in this meeting" });
  }

  const grant = await prisma.presenterGrant.update({
    where: { id: before.id },
    data: { revokedAt: new Date(), revokedBy: actorEmail(req) },
  });

  await logAudit({
    meetingId,
    actorEmail: actorEmail(req),
    action: "presenterGrant.revoke",
    before,
    after: grant,
  });

  await syncMeetingRoles(meetingId);
  await broadcastState(meetingId);
  res.json(grant);
});
