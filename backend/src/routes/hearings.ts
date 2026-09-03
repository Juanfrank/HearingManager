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

export const hearingsRouter = Router();

// Set by requireTeamsUser (index.ts) from the verified Teams-SSO token —
// see auth/verifyTeamsToken.ts. Always defined by the time a route here
// runs; the fallback is just to keep TypeScript happy.
function actorEmail(req: import("express").Request): string {
  return (req as AuthedRequest).actorEmail ?? "unknown@local";
}

hearingsRouter.get("/", async (_req, res) => {
  const snapshot = await buildStateSnapshot(false);
  res.json(snapshot.hearings);
});

hearingsRouter.post("/", async (req, res) => {
  const { hearingNumber, expectedParties } = req.body as {
    hearingNumber: number;
    expectedParties?: { name: string; email: string; role?: string }[];
  };
  const hearing = await prisma.hearing.create({
    data: {
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
    hearingId: hearing.id,
    actorEmail: actorEmail(req),
    action: "hearing.create",
    after: hearing,
  });
  await broadcastState();
  res.status(201).json(hearing);
});

hearingsRouter.patch("/:id/notes", async (req, res) => {
  const { notes } = req.body as { notes: string };
  const before = await prisma.hearing.findUniqueOrThrow({ where: { id: req.params.id } });
  const hearing = await prisma.hearing.update({
    where: { id: req.params.id },
    data: { notes },
  });
  await logAudit({
    hearingId: hearing.id,
    actorEmail: actorEmail(req),
    action: "hearing.notes.update",
    before: { notes: before.notes },
    after: { notes: hearing.notes },
  });
  await broadcastState();
  res.json(hearing);
});

hearingsRouter.post("/:id/activate", async (req, res) => {
  try {
    const period = await activateHearing(req.params.id, actorEmail(req));
    await broadcastState();
    res.json({ ok: true, periodId: period.id });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

hearingsRouter.post("/:id/complete", async (req, res) => {
  try {
    await completeHearing(req.params.id, actorEmail(req));
    await broadcastState();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

hearingsRouter.post("/:id/reactivate", async (req, res) => {
  try {
    const period = await reactivateHearing(req.params.id, actorEmail(req));
    await broadcastState();
    res.json({ ok: true, periodId: period.id });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
