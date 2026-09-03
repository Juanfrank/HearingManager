import { meetingIdParam } from "../util/params";
import { Router } from "express";
import { prisma } from "../db";
import { broadcastState } from "../ws";
import { logAudit } from "../services/auditLog";
import {
  activateHearing,
  completeHearing,
  reactivateHearing,
} from "../graph/roleManager";
import { buildStateSnapshot } from "../services/stateSnapshot";
import type { AuthedRequest } from "../auth/verifyTeamsToken";

// mergeParams: mounted under /api/meetings/:meetingId (index.ts).
export const hearingsRouter = Router({ mergeParams: true });

// Set by requireTeamsUser (index.ts) from the verified Teams-SSO token —
// see auth/verifyTeamsToken.ts. Always defined by the time a route here
// runs; the fallback is just to keep TypeScript happy.
function actorEmail(req: import("express").Request): string {
  return (req as AuthedRequest).actorEmail ?? "unknown@local";
}

hearingsRouter.get("/", async (req, res) => {
  const snapshot = await buildStateSnapshot(meetingIdParam(req), false);
  res.json(snapshot.hearings);
});

hearingsRouter.post("/", async (req, res) => {
  const meetingId = meetingIdParam(req);
  const { hearingNumber, expectedParties } = req.body as {
    hearingNumber: number;
    expectedParties?: { name: string; email: string; role?: string }[];
  };
  const hearing = await prisma.hearing.create({
    data: {
      meetingId,
      hearingNumber,
      expectedParties: {
        create: (expectedParties ?? []).map((p) => ({
          name: p.name,
          email: p.email.toLowerCase(),
          role: (p.role as any) ?? "PARTY",
        })),
      },
    },
    include: { expectedParties: true },
  });
  await logAudit({
    meetingId,
    hearingId: hearing.id,
    actorEmail: actorEmail(req),
    action: "hearing.create",
    after: hearing,
  });
  await broadcastState(meetingId);
  res.status(201).json(hearing);
});

hearingsRouter.patch("/:id/notes", async (req, res) => {
  const meetingId = meetingIdParam(req);
  const { notes } = req.body as { notes: string };
  const before = await prisma.hearing.findFirstOrThrow({
    where: { id: req.params.id, meetingId },
  });
  const hearing = await prisma.hearing.update({
    where: { id: req.params.id },
    data: { notes },
  });
  await logAudit({
    meetingId,
    hearingId: hearing.id,
    actorEmail: actorEmail(req),
    action: "hearing.notes.update",
    before: { notes: before.notes },
    after: { notes: hearing.notes },
  });
  await broadcastState(meetingId);
  res.json(hearing);
});

hearingsRouter.post("/:id/activate", async (req, res) => {
  const meetingId = meetingIdParam(req);
  try {
    const period = await activateHearing(meetingId, req.params.id, actorEmail(req));
    await broadcastState(meetingId);
    res.json({ ok: true, periodId: period.id });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

hearingsRouter.post("/:id/complete", async (req, res) => {
  const meetingId = meetingIdParam(req);
  try {
    await completeHearing(meetingId, req.params.id, actorEmail(req));
    await broadcastState(meetingId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

hearingsRouter.post("/:id/reactivate", async (req, res) => {
  const meetingId = meetingIdParam(req);
  try {
    const period = await reactivateHearing(meetingId, req.params.id, actorEmail(req));
    await broadcastState(meetingId);
    res.json({ ok: true, periodId: period.id });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
