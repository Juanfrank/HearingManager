import type { NextFunction, Response } from "express";
import { prisma } from "../db";
import { meetingIdParam } from "../util/params";
import { isDevBypass, type AuthedRequest } from "./verifyTeamsToken";

/**
 * requireTeamsUser (verifyTeamsToken.ts) only proves the caller holds a
 * valid token for THIS APP — i.e. they're some real signed-in user of the
 * tenant, not that they're allowed to touch the specific :meetingId in the
 * request. Without this check, any authenticated user could read/mutate
 * any OTHER meeting's hearings, roster, messages, presenter grants,
 * mute/camera actions, etc. just by knowing (or guessing) its meetingId,
 * and a Socket.IO client could receive another meeting's live participant
 * PII the same way — see the security review this fixes.
 *
 * By product decision, this app's API/tab is JUDGES AND AUXILIARIES ONLY
 * — parties and general public are tracked (roster presence, attendance
 * status, presenter eligibility) but never granted access to call this
 * API or load the tab themselves. So "authorized for this meeting" =
 * exactly "a JudgeOrAuxiliary row for this meetingId" — added via the
 * API-key-gated /provision route or the daily CMS import, never
 * self-servable by an ordinary caller (see routes/judges.ts). Merely
 * having joined the Teams meeting (a RosterEntry row) is NOT sufficient
 * on its own — that's true of parties and general public too, and they
 * must stay locked out.
 *
 * Deliberately NOT applied to POST /register (routes/meetings.ts has its
 * own narrower rule — it's how the very first legitimate judge bootstraps
 * a brand-new meeting, before their own JudgeOrAuxiliary row may exist
 * yet if provisioning hasn't run first) or to the roster-simulation
 * routes (routes/roster.ts — dev-only, independently gated by
 * ALLOW_ROSTER_SIMULATION, which must be off in production). Skipped
 * entirely under AUTH_MODE=dev-bypass, same as requireTeamsUser itself.
 */
export async function isMeetingMember(meetingId: string, email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!meetingId || !normalized) return false;

  const judge = await prisma.judgeOrAuxiliary.findFirst({
    where: { meetingId, emails: { has: normalized } },
    select: { id: true },
  });

  return Boolean(judge);
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
