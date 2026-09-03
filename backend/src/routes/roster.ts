import { meetingIdParam } from "../util/params";
import { Router } from "express";
import { prisma } from "../db";
import { broadcastState, setRosterStale } from "../ws";
import { syncMeetingRoles } from "../graph/roleManager";

// mergeParams: this router is mounted under /api/meetings/:meetingId
// (index.ts) alongside every other resource router — see routes/meetings.ts
// for where :meetingId itself comes from and how a Meeting row gets created.
export const rosterRouter = Router({ mergeParams: true });

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

  await applyRosterEvent(meetingIdParam(req), email, displayName ?? email, type);
  await broadcastState(meetingIdParam(req));
  res.json({ ok: true });
});

/**
 * The one code path both the real bot (bot/index.ts, in-process) and the
 * dev simulation endpoint above use — single source of truth for "a
 * roster event happened," scoped to whichever meeting it happened in.
 * Upserts the Meeting row too: this is often the very first thing that
 * happens for a brand-new meeting (a participant joins before anyone has
 * hit routes/meetings.ts's explicit register endpoint), and RosterEntry's
 * meetingId foreign key requires the Meeting row to already exist.
 */
export async function applyRosterEvent(
  meetingId: string,
  email: string,
  displayName: string,
  type: "joined" | "left",
) {
  const normalizedEmail = email.trim().toLowerCase();

  await prisma.meeting.upsert({
    where: { id: meetingId },
    create: { id: meetingId },
    update: {},
  });

  if (type === "joined") {
    await prisma.rosterEntry.upsert({
      where: { meetingId_email: { meetingId, email: normalizedEmail } },
      create: {
        meetingId,
        email: normalizedEmail,
        displayName,
        isConnected: true,
        joinedAt: new Date(),
      },
      update: { isConnected: true, displayName, joinedAt: new Date(), leftAt: null },
    });
  } else {
    await prisma.rosterEntry.updateMany({
      where: { meetingId, email: normalizedEmail },
      data: { isConnected: false, leftAt: new Date() },
    });
  }

  // A judge/auxiliary joining or leaving changes who should be presenter
  // right now (services/presenterRules.ts) — not just at Activate/
  // Complete/Reactivate. Never let a Graph hiccup break roster tracking
  // itself: the RosterEntry write above already succeeded regardless.
  try {
    await syncMeetingRoles(meetingId);
  } catch (err) {
    console.error("[roster] syncMeetingRoles failed after roster event", err);
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
  setRosterStale(meetingIdParam(req), Boolean(stale));
  res.json({ ok: true });
});
