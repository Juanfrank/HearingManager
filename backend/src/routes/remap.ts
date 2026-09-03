import { meetingIdParam } from "../util/params";
import { Router } from "express";
import { prisma } from "../db";
import { broadcastState } from "../ws";
import { logAudit } from "../services/auditLog";
import type { AuthedRequest } from "../auth/verifyTeamsToken";

// mergeParams: mounted under /api/meetings/:meetingId (index.ts).
export const remapRouter = Router({ mergeParams: true });

// Set by requireTeamsUser (index.ts) from the verified Teams-SSO token.
function actorEmail(req: import("express").Request): string {
  return (req as AuthedRequest).actorEmail ?? "unknown@local";
}

/**
 * docs §5.5: staff resolve an unmatched roster email by mapping it to an
 * existing ExpectedParty in a specific hearing, or creating a new_party
 * under a hearing. Treated as present in the target hearing going forward.
 */
remapRouter.post("/", async (req, res) => {
  const meetingId = meetingIdParam(req);
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

  // Same cross-tenant guard as parties.ts: confirm the target hearing (and
  // the roster entry, if it's from this meeting) actually belong here.
  const hearing = await prisma.hearing.findFirst({ where: { id: hearingId, meetingId } });
  if (!hearing) {
    return res.status(404).json({ error: "hearing not found in this meeting" });
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
    meetingId,
    hearingId,
    actorEmail: actorEmail(req),
    action: "remap.create",
    after: mapping,
  });
  await broadcastState(meetingId);
  res.status(201).json(mapping);
});

/**
 * docs §5.5: "Undo" sets undone_at, removing the entry from the hearing's
 * derived roster and returning it to general public as active again.
 */
remapRouter.post("/:id/undo", async (req, res) => {
  const meetingId = meetingIdParam(req);
  const before = await prisma.remapMapping.findFirst({
    where: { id: req.params.id, hearing: { meetingId } },
  });
  if (!before) {
    return res.status(404).json({ error: "remap not found in this meeting" });
  }

  const mapping = await prisma.remapMapping.update({
    where: { id: before.id },
    data: { undoneAt: new Date() },
  });
  await logAudit({
    meetingId,
    hearingId: mapping.hearingId,
    actorEmail: actorEmail(req),
    action: "remap.undo",
    before,
    after: mapping,
  });
  await broadcastState(meetingId);
  res.json(mapping);
});
