import { meetingIdParam } from "../util/params";
import { Router } from "express";
import { prisma } from "../db";
import { broadcastState } from "../ws";
import { externalUidOrSynthetic } from "../util/identity";

// mergeParams: mounted under /api/meetings/:meetingId (index.ts).
export const judgesRouter = Router({ mergeParams: true });

judgesRouter.get("/", async (req, res) => {
  res.json(await prisma.judgeOrAuxiliary.findMany({ where: { meetingId: meetingIdParam(req) } }));
});

judgesRouter.post("/", async (req, res) => {
  const meetingId = meetingIdParam(req);
  const { emails, name, role, externalUid } = req.body as {
    emails: string[];
    name: string;
    role: "JUDGE" | "PRESIDING_JUDGE" | "SECRETARY" | "OTHER_OFFICER";
    externalUid?: string;
  };
  if (!emails?.length) {
    return res.status(400).json({ error: "emails must be a non-empty array" });
  }
  const normalizedEmails = emails.map((e) => e.toLowerCase());
  const uid = externalUidOrSynthetic(externalUid, normalizedEmails[0]);

  // Requires the Meeting row to already exist (FK) — the tab registers it
  // on startup (routes/meetings.ts) before this is ever called.
  const record = await prisma.judgeOrAuxiliary.upsert({
    where: { meetingId_externalUid: { meetingId, externalUid: uid } },
    create: { meetingId, emails: normalizedEmails, name, role, externalUid: uid },
    update: { emails: normalizedEmails, name, role },
  });
  await broadcastState(meetingId);
  res.status(201).json(record);
});
