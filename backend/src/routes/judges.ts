import { Router } from "express";
import { prisma } from "../db";
import { broadcastState } from "../ws";

export const judgesRouter = Router();

judgesRouter.get("/", async (_req, res) => {
  res.json(await prisma.judgeOrAuxiliary.findMany());
});

judgesRouter.post("/", async (req, res) => {
  const { email, name, role } = req.body as {
    email: string;
    name: string;
    role: "JUDGE" | "PRESIDING_JUDGE" | "SECRETARY" | "OTHER_OFFICER";
  };
  const record = await prisma.judgeOrAuxiliary.upsert({
    where: { email: email.toLowerCase() },
    create: { email: email.toLowerCase(), name, role },
    update: { name, role },
  });
  await broadcastState();
  res.status(201).json(record);
});
