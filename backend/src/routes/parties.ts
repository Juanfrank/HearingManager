import { Router } from "express";
import { prisma } from "../db";
import { broadcastState } from "../ws";
import { logAudit } from "../services/auditLog";

export const partiesRouter = Router();

partiesRouter.post("/", async (req, res) => {
  const { hearingId, name, email, role } = req.body as {
    hearingId: string;
    name: string;
    email: string;
    role?: "PARTY" | "COUNSEL" | "WITNESS" | "OTHER";
  };
  const party = await prisma.expectedParty.create({
    data: { hearingId, name, email: email.toLowerCase(), role: role ?? "PARTY" },
  });
  await logAudit({
    hearingId,
    actorEmail: req.header("x-actor-email") || "unknown@local",
    action: "expectedParty.create",
    after: party,
  });
  await broadcastState();
  res.status(201).json(party);
});

partiesRouter.delete("/:id", async (req, res) => {
  const party = await prisma.expectedParty.delete({ where: { id: req.params.id } });
  await logAudit({
    hearingId: party.hearingId,
    actorEmail: req.header("x-actor-email") || "unknown@local",
    action: "expectedParty.delete",
    before: party,
  });
  await broadcastState();
  res.json({ ok: true });
});
