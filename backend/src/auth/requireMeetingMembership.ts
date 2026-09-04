import type { NextFunction, Response } from "express";
import { prisma } from "../db";
import { meetingIdParam } from "../util/params";
import { isDevBypass, type AuthedRequest } from "./verifyTeamsToken";

/**
 * requireTeamsUser (verifyTeamsToken.ts) only proves the caller holds a
 * valid token for THIS APP — i.e. they're some real signed-in user of the
 * tenant, not that they're allowed to touch the specific :meetingId in the
 * request. Without a check here, any authenticated user could read/mutate
 * any OTHER meeting's hearings, roster, messages, presenter grants,
 * mute/camera actions, etc. just by knowing (or guessing) its meetingId,
 * and a Socket.IO client could receive another meeting's live participant
 * PII the same way.
 *
 * Two tiers, by product decision — see, view, but never touch if you're
 * not staff:
 * - **Staff** (`isMeetingStaff`/`requireMeetingStaff`) — a provisioned
 *   `JudgeOrAuxiliary` row for this meetingId (added via the API-key-gated
 *   /provision route or the daily CMS import, never self-servable by an
 *   ordinary caller — see routes/judges.ts). Required for every
 *   state-changing route: activate/complete a hearing, remap, message,
 *   grant/revoke presenter, mute/camera, end the session, edit notes.
 * - **Viewer** (`isMeetingParticipant`/`requireMeetingViewer`) — staff OR
 *   merely connected to the meeting (a `RosterEntry` row) — parties and
 *   general public included. Required for the read-only surfaces only:
 *   `GET /state` and the Socket.IO connection. Lets anyone actually in the
 *   meeting watch the same live dashboard staff sees, with no ability to
 *   act on anything (the tab itself also hides every action control for a
 *   non-staff viewer — see `tab/src/App.tsx`'s `isStaff` — but that's a
 *   UX nicety, not the security boundary; the boundary is these two
 *   middlewares).
 *
 * Deliberately NOT applied to POST /register (routes/meetings.ts has its
 * own narrower rule — it's how the very first legitimate judge bootstraps
 * a brand-new meeting, before their own JudgeOrAuxiliary row may exist
 * yet if provisioning hasn't run first) or to the roster-simulation
 * routes (routes/roster.ts — dev-only, independently gated by
 * ALLOW_ROSTER_SIMULATION, which must be off in production). Both
 * middlewares are skipped entirely under AUTH_MODE=dev-bypass, same as
 * requireTeamsUser itself.
 */
export async function isMeetingStaff(meetingId: string, email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!meetingId || !normalized) return false;

  const judge = await prisma.judgeOrAuxiliary.findFirst({
    where: { meetingId, emails: { has: normalized } },
    select: { id: true },
  });

  return Boolean(judge);
}

export async function isMeetingParticipant(meetingId: string, email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!meetingId || !normalized) return false;

  const [staff, roster] = await Promise.all([
    prisma.judgeOrAuxiliary.findFirst({
      where: { meetingId, emails: { has: normalized } },
      select: { id: true },
    }),
    prisma.rosterEntry.findFirst({
      where: { meetingId, email: normalized },
      select: { id: true },
    }),
  ]);

  return Boolean(staff || roster);
}

export async function requireMeetingStaff(req: AuthedRequest, res: Response, next: NextFunction) {
  if (isDevBypass()) return next();

  const meetingId = meetingIdParam(req);
  const email = req.actorEmail ?? "";

  if (!(await isMeetingStaff(meetingId, email))) {
    return res.status(403).json({ error: "not authorized for this meeting" });
  }

  next();
}

export async function requireMeetingViewer(req: AuthedRequest, res: Response, next: NextFunction) {
  if (isDevBypass()) return next();

  const meetingId = meetingIdParam(req);
  const email = req.actorEmail ?? "";

  if (!(await isMeetingParticipant(meetingId, email))) {
    return res.status(403).json({ error: "not authorized for this meeting" });
  }

  next();
}
