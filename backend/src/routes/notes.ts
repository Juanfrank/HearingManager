import { Router } from "express";
import { prisma } from "../db";
import { meetingIdParam } from "../util/params";
import type { AuthedRequest } from "../auth/verifyTeamsToken";
import { logAudit } from "../services/auditLog";

// mergeParams: mounted under /api/meetings/:meetingId (index.ts).
export const notesRouter = Router({ mergeParams: true });

function actorEmail(req: import("express").Request): string {
  return (req as AuthedRequest).actorEmail ?? "unknown@local";
}

/**
 * Personal, per-author hearing notes — never shared or crossed between
 * staff. This ONLY ever returns the calling user's own notes; there is no
 * endpoint anywhere that returns another author's HearingNote rows, and
 * the live state snapshot (services/stateSnapshot.ts) never includes
 * notes at all — see docs/README.md.
 *
 * Returns { [hearingId]: text } for every hearing in this meeting that has
 * a note from this author (hearings with none are simply absent).
 */
notesRouter.get("/notes", async (req, res) => {
  const meetingId = meetingIdParam(req);
  const rows = await prisma.hearingNote.findMany({
    where: { authorEmail: actorEmail(req), hearing: { meetingId } },
    select: { hearingId: true, text: true },
  });
  const byHearing: Record<string, string> = {};
  for (const r of rows) byHearing[r.hearingId] = r.text;
  res.json(byHearing);
});

/** Upserts the CALLING USER'S OWN note for one hearing — never anyone else's. */
notesRouter.put("/hearings/:id/notes", async (req, res) => {
  const meetingId = meetingIdParam(req);
  const { text } = req.body as { text: string };
  const author = actorEmail(req);

  const hearing = await prisma.hearing.findFirst({ where: { id: req.params.id, meetingId } });
  if (!hearing) {
    return res.status(404).json({ error: "hearing not found in this meeting" });
  }

  const before = await prisma.hearingNote.findUnique({
    where: { hearingId_authorEmail: { hearingId: hearing.id, authorEmail: author } },
  });

  const note = await prisma.hearingNote.upsert({
    where: { hearingId_authorEmail: { hearingId: hearing.id, authorEmail: author } },
    create: { hearingId: hearing.id, authorEmail: author, text },
    update: { text },
  });

  // Full note text goes into the audit trail (an internal judiciary
  // record, per docs/README.md §7) even though the live UI never shows it
  // to anyone but its author — that's intentional, not a leak: there's no
  // audit-log-viewing UI in the tab today.
  await logAudit({
    meetingId,
    hearingId: hearing.id,
    actorEmail: author,
    action: "hearing.notes.update",
    before: { text: before?.text ?? "" },
    after: { text: note.text },
  });

  // No broadcastState() here — notes must never travel over the shared
  // socket channel, or "personal, not crossed" breaks immediately.
  res.json({ ok: true });
});
