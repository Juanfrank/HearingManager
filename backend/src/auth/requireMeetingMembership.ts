import type { NextFunction, Response } from "express";
import { prisma } from "../db";
import { meetingIdParam } from "../util/params";
import { isDevBypass, type AuthedRequest } from "./verifyTeamsToken";

/**
 * requireTeamsUser (verifyTeamsToken.ts) only proves the caller holds a
 * valid token for THIS APP — i.e. they're some real signed-in user of the
 * tenant, not that they belong to the specific :meetingId in the request.
 * Without this check, any authenticated user could read/mutate any OTHER
 * meeting's hearings, roster, messages, presenter grants, mute/camera
 * actions, etc. just by knowing (or guessing) its meetingId, and a
 * Socket.IO client could receive another meeting's live participant PII
 * the same way — see the security review this fixes.
 *
 * "Belongs to this meeting" = either explicitly provisioned staff (a
 * JudgeOrAuxiliary row for this meetingId, added via the API-key-gated
 * /provision route or the daily CMS import — never self-servable by an
 * ordinary caller, see routes/judges.ts) or someone who has actually
 * connected to this Teams meeting (a RosterEntry row for it, created only
 * by the bot's real roster events or the ALLOW_ROSTER_SIMULATION-gated
 * dev endpoint — never self-registerable by an arbitrary caller either).
 *
 * Deliberately NOT applied to POST /register (routes/meetings.ts has its
 * own narrower rule — it's how the very first legitimate participant
 * bootstraps a brand-new meeting, before any judge/roster row can exist
 * for them) or to the roster-simulation routes (routes/roster.ts — those
 * are the mechanism that GRANTS membership in the first place, and are
 * independently gated by ALLOW_ROSTER_SIMULATION, which must be off in
 * production). Skipped entirely under AUTH_MODE=dev-bypass, same as
 * requireTeamsUser itself.
 */
export async function isMeetingMember(meetingId: string, email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!meetingId || !normalized) return false;

  const [judge, roster] = await Promise.all([
    prisma.judgeOrAuxiliary.findFirst({
      where: { meetingId, emails: { has: normalized } },
      select: { id: true },
    }),
    prisma.rosterEntry.findFirst({
      where: { meetingId, email: normalized },
      select: { id: true },
    }),
  ]);

  return Boolean(judge || roster);
}

export async function requireMeetingMembership(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) {
  if (isDevBypass()) return next();

  const meetingId = meetingIdParam(req);
  const email = req.actorEmail ?? "";

  if (!(await isMeetingMember(meetingId, email))) {
    return res.status(403).json({ error: "not authorized for this meeting" });
  }

  next();
}
