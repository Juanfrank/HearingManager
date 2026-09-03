import { meetingIdParam } from "../util/params";
import { Router } from "express";
import { prisma } from "../db";
import { broadcastState } from "../ws";
import { logAudit } from "../services/auditLog";
import {
  activateHearing,
  completeHearing,
  reactivateHearing,
  AlreadyActiveHearingError,
} from "../graph/roleManager";
import { buildStateSnapshot } from "../services/stateSnapshot";
import { externalUidOrSynthetic } from "../util/identity";
import type { AuthedRequest } from "../auth/verifyTeamsToken";

// mergeParams: mounted under /api/meetings/:meetingId (index.ts).
export const hearingsRouter = Router({ mergeParams: true });

// Set by requireTeamsUser (index.ts) from the verified Teams-SSO token —
// see auth/verifyTeamsToken.ts. Always defined by the time a route here
// runs; the fallback is just to keep TypeScript happy.
function actorEmail(req: import("express").Request): string {
  return (req as AuthedRequest).actorEmail ?? "unknown@local";
}

/**
 * Structured error body — {code, ...details} rather than a hardcoded
 * English sentence — so the tab renders it via its own translation table
 * (tab/src/i18n) instead of displaying backend text directly.
 */
function respondError(res: import("express").Response, err: unknown) {
  if (err instanceof AlreadyActiveHearingError) {
    return res.status(409).json({ code: err.code, hearingNumber: err.hearingNumber });
  }
  res.status(500).json({ code: "INTERNAL", message: (err as Error).message });
}

hearingsRouter.get("/", async (req, res) => {
  const snapshot = await buildStateSnapshot(meetingIdParam(req), false);
  res.json(snapshot.hearings);
});

hearingsRouter.post("/", async (req, res) => {
  const meetingId = meetingIdParam(req);
  const { hearingNumber, expectedParties } = req.body as {
    hearingNumber: number;
    expectedParties?: { name: string; emails: string[]; role?: string; externalUid?: string }[];
  };
  const hearing = await prisma.hearing.create({
    data: {
      meetingId,
      hearingNumber,
      expectedParties: {
        create: (expectedParties ?? []).map((p) => {
          const normalizedEmails = p.emails.map((e) => e.toLowerCase());
          return {
            name: p.name,
            emails: normalizedEmails,
            role: (p.role as any) ?? "PARTY",
            externalUid: externalUidOrSynthetic(p.externalUid, normalizedEmails[0]),
          };
        }),
      },
    },
    include: { expectedParties: true },
  });
  await logAudit({
    meetingId,
    hearingId: hearing.id,
    actorEmail: actorEmail(req),
    action: "hearing.create",
    after: hearing,
  });
  await broadcastState(meetingId);
  res.status(201).json(hearing);
});

// Notes are now personal/per-author — see routes/notes.ts
// (GET /notes, PUT /hearings/:id/notes), mounted separately in index.ts.
// The old shared PATCH /:id/notes route that lived here is gone.

hearingsRouter.post("/:id/activate", async (req, res) => {
  const meetingId = meetingIdParam(req);
  try {
    const period = await activateHearing(meetingId, req.params.id, actorEmail(req));
    await broadcastState(meetingId);
    res.json({ ok: true, periodId: period.id });
  } catch (err) {
    respondError(res, err);
  }
});

hearingsRouter.post("/:id/complete", async (req, res) => {
  const meetingId = meetingIdParam(req);
  try {
    await completeHearing(meetingId, req.params.id, actorEmail(req));
    await broadcastState(meetingId);
    res.json({ ok: true });
  } catch (err) {
    respondError(res, err);
  }
});

hearingsRouter.post("/:id/reactivate", async (req, res) => {
  const meetingId = meetingIdParam(req);
  try {
    const period = await reactivateHearing(meetingId, req.params.id, actorEmail(req));
    await broadcastState(meetingId);
    res.json({ ok: true, periodId: period.id });
  } catch (err) {
    respondError(res, err);
  }
});
