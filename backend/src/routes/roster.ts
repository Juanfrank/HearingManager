import { Router } from "express";
import { prisma } from "../db";
import { broadcastState, setRosterStale } from "../ws";

export const rosterRouter = Router();

// The bot never calls this over HTTP — bot/index.ts imports and calls
// applyRosterEvent() directly in-process. This route only exists so the
// join/leave flow is exercisable without a live Teams meeting (see
// docs/README.md "Local development"), which is exactly the kind of thing
// that must NOT be reachable by an ordinary signed-in user in production —
// gate it behind an explicit opt-in rather than just requireTeamsUser.
const ALLOW_ROSTER_SIMULATION = process.env.ALLOW_ROSTER_SIMULATION === "true";

/**
 * Simulates a bot roster join/leave event for local dev/testing without a
 * live Teams meeting. Requires ALLOW_ROSTER_SIMULATION=true — never set
 * that in production, since anyone with a valid Teams-SSO token could
 * otherwise fabricate attendance.
 */
rosterRouter.post("/event", async (req, res) => {
  if (!ALLOW_ROSTER_SIMULATION) {
    return res.status(403).json({
      error: "roster simulation is disabled (set ALLOW_ROSTER_SIMULATION=true for local dev)",
    });
  }

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

/**
 * docs §7: expose bot/Graph roster connection health explicitly. Like
 * /event above, the real bot flips this in-process (bot/index.ts) — this
 * HTTP path is only for manually exercising the "stale" banner in dev.
 */
rosterRouter.post("/connection-health", async (req, res) => {
  if (!ALLOW_ROSTER_SIMULATION) {
    return res.status(403).json({
      error: "roster simulation is disabled (set ALLOW_ROSTER_SIMULATION=true for local dev)",
    });
  }
  const { stale } = req.body as { stale: boolean };
  setRosterStale(Boolean(stale));
  res.json({ ok: true });
});
