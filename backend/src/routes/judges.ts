import { meetingIdParam } from "../util/params";
import { Router } from "express";
import { prisma } from "../db";
import { broadcastState } from "../ws";

// mergeParams: mounted under /api/meetings/:meetingId (index.ts).
export const judgesRouter = Router({ mergeParams: true });

judgesRouter.get("/", async (req, res) => {
  res.json(await prisma.judgeOrAuxiliary.findMany({ where: { meetingId: meetingIdParam(req) } }));
});

judgesRouter.post("/", async (req, res) => {
  const meetingId = meetingIdParam(req);
  const { email, name, role } = req.body as {
    email: string;
    name: string;
    role: "JUDGE" | "PRESIDING_JUDGE" | "SECRETARY" | "OTHER_OFFICER";
  };
  // Requires the Meeting row to already exist (FK) — the tab registers it
  // on startup (routes/meetings.ts) before this is ever called.
  const record = await prisma.judgeOrAuxiliary.upsert({
    where: { meetingId_email: { meetingId, email: email.toLowerCase() } },
    create: { meetingId, email: email.toLowerCase(), name, role },
    update: { name, role },
  });
  await broadcastState(meetingId);
  res.status(201).json(record);
});
