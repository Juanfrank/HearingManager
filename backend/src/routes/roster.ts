import { Router } from "express";
import { prisma } from "../db";
import { broadcastState, setRosterStale } from "../ws";

export const rosterRouter = Router();

/**
 * Fed by the bot's conversationUpdate roster events (docs §5.1), and also
 * directly callable here — this is the one code path both use, so there is
 * a single source of truth for "a roster event happened" whether it came
 * from a live Teams meeting or (for local dev/testing without one) a
 * simulated call to this endpoint.
 */
rosterRouter.post("/event", async (req, res) => {
  const { email, displayName, type } = req.body as {
    email: string;
    displayName?: string;
    type: "joined" | "left";
  };
  if (!email || !type) {
    return res.status(400).json({ error: "email and type are required" });
  }

  await applyRosterEvent(email, displayName ?? email, type);
  await broadcastState();
  res.json({ ok: true });
});

export async function applyRosterEvent(
  email: string,
  displayName: string,
  type: "joined" | "left",
) {
  const normalizedEmail = email.trim().toLowerCase();
  if (type === "joined") {
    await prisma.rosterEntry.upsert({
      where: { email: normalizedEmail },
      create: {
        email: normalizedEmail,
        displayName,
        isConnected: true,
        joinedAt: new Date(),
      },
      update: { isConnected: true, displayName, joinedAt: new Date(), leftAt: null },
    });
  } else {
    await prisma.rosterEntry.updateMany({
      where: { email: normalizedEmail },
      data: { isConnected: false, leftAt: new Date() },
    });
  }
}

/** docs §7: expose bot/Graph roster connection health explicitly. */
rosterRouter.post("/connection-health", async (req, res) => {
  const { stale } = req.body as { stale: boolean };
  setRosterStale(Boolean(stale));
  res.json({ ok: true });
});
