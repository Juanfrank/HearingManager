import { Router } from "express";
import { prisma } from "../db";
import { broadcastState } from "../ws";
import { logAudit } from "../services/auditLog";

export const remapRouter = Router();

function actorEmail(req: import("express").Request): string {
  return (req.header("x-actor-email") || req.body?.actorEmail || "unknown@local").toLowerCase();
}

/**
 * docs §5.5: staff resolve an unmatched roster email by mapping it to an
 * existing ExpectedParty in a specific hearing, or creating a new_party
 * under a hearing. Treated as present in the target hearing going forward.
 */
remapRouter.post("/", async (req, res) => {
  const { rosterEmail, hearingId, mappedToExpectedPartyId, newPartyName } = req.body as {
    rosterEmail: string;
    hearingId: string;
    mappedToExpectedPartyId?: string;
    newPartyName?: string;
  };

  if (!mappedToExpectedPartyId && !newPartyName) {
    return res
      .status(400)
      .json({ error: "either mappedToExpectedPartyId or newPartyName is required" });
  }

  const mapping = await prisma.remapMapping.create({
    data: {
      rosterEmail: rosterEmail.toLowerCase(),
      hearingId,
      mappedToType: mappedToExpectedPartyId ? "EXISTING_PARTY" : "NEW_PARTY",
      mappedToExpectedPartyId: mappedToExpectedPartyId ?? null,
      newPartyName: newPartyName ?? null,
    },
  });

  await logAudit({
    hearingId,
    actorEmail: actorEmail(req),
    action: "remap.create",
    after: mapping,
  });
  await broadcastState();
  res.status(201).json(mapping);
});

/**
 * docs §5.5: "Undo" sets undone_at, removing the entry from the hearing's
 * derived roster and returning it to general public as active again.
 */
remapRouter.post("/:id/undo", async (req, res) => {
  const before = await prisma.remapMapping.findUniqueOrThrow({ where: { id: req.params.id } });
  const mapping = await prisma.remapMapping.update({
    where: { id: req.params.id },
    data: { undoneAt: new Date() },
  });
  await logAudit({
    hearingId: mapping.hearingId,
    actorEmail: actorEmail(req),
    action: "remap.undo",
    before,
    after: mapping,
  });
  await broadcastState();
  res.json(mapping);
});
