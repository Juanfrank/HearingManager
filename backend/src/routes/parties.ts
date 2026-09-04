import { meetingIdParam } from "../util/params";
import { Router } from "express";
import { prisma } from "../db";
import { broadcastState } from "../ws";
import { logAudit } from "../services/auditLog";
import { externalUidOrSynthetic } from "../util/identity";
import type { AuthedRequest } from "../auth/verifyTeamsToken";

// mergeParams: mounted under /api/meetings/:meetingId (index.ts).
export const partiesRouter = Router({ mergeParams: true });

partiesRouter.post("/", async (req, res) => {
  const meetingId = meetingIdParam(req);
  const { hearingId, name, emails, role, externalUid } = req.body as {
    hearingId: string;
    name: string;
    emails: string[];
    role?: "PARTY" | "COUNSEL" | "WITNESS" | "OTHER";
    externalUid?: string;
  };
  if (!emails?.length) {
    return res.status(400).json({ error: "emails must be a non-empty array" });
  }

  // Confirm the hearing this party is being attached to actually belongs
  // to this meeting — without this check, a valid Teams-SSO user in
  // meeting A could attach parties to a hearing in meeting B just by
  // guessing/reusing its id.
  const hearing = await prisma.hearing.findFirst({ where: { id: hearingId, meetingId } });
  if (!hearing) {
    return res.status(404).json({ error: "hearing not found in this meeting" });
  }

  const normalizedEmails = emails.map((e) => e.toLowerCase());
  const uid = externalUidOrSynthetic(externalUid, normalizedEmails[0]);
  // upsert, not create: re-posting the same person (same hearingId +
  // externalUid) updates them instead of hitting the unique constraint —
  // same reasoning as routes/judges.ts.
  const party = await prisma.expectedParty.upsert({
    where: { hearingId_externalUid: { hearingId, externalUid: uid } },
    create: {
      hearingId,
      name,
      emails: { create: normalizedEmails.map((email) => ({ email })) },
      role: role ?? "PARTY",
      externalUid: uid,
    },
    update: {
      name,
      emails: { deleteMany: {}, create: normalizedEmails.map((email) => ({ email })) },
      role: role ?? "PARTY",
    },
    include: { emails: true },
  });
  const partyView = { ...party, emails: party.emails.map((e) => e.email) };
  await logAudit({
    meetingId,
    hearingId,
    actorEmail: (req as AuthedRequest).actorEmail ?? "unknown@local",
    action: "expectedParty.create",
    after: partyView,
  });
  await broadcastState(meetingId);
  res.status(201).json(partyView);
});

partiesRouter.delete("/:id", async (req, res) => {
  const meetingId = meetingIdParam(req);
  const party = await prisma.expectedParty.findFirst({
    where: { id: req.params.id, hearing: { meetingId } },
    include: { emails: true },
  });
  if (!party) {
    return res.status(404).json({ error: "party not found in this meeting" });
  }

  // Cascades to the party's PartyEmail rows (schema.prisma's onDelete:
  // Cascade) — no separate cleanup needed for the child table.
  await prisma.expectedParty.delete({ where: { id: party.id } });
  await logAudit({
    meetingId,
    hearingId: party.hearingId,
    actorEmail: (req as AuthedRequest).actorEmail ?? "unknown@local",
    action: "expectedParty.delete",
    before: { ...party, emails: party.emails.map((e) => e.email) },
  });
  await broadcastState(meetingId);
  res.json({ ok: true });
});
