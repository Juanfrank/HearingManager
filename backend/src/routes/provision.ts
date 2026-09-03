import { Router } from "express";
import { prisma } from "../db";
import { broadcastState } from "../ws";
import { logAudit } from "../services/auditLog";
import { meetingIdParam } from "../util/params";
import { requireProvisioningKey } from "../auth/requireProvisioningKey";

// mergeParams: mounted at the exact path
// /api/meetings/:meetingId/provision (index.ts), BEFORE the requireTeamsUser
// blanket middleware — see index.ts for why. requireProvisioningKey is
// applied here, router-scoped, rather than in index.ts's app.use(), so it
// can never accidentally end up guarding some other meeting-scoped route
// that app.use's prefix-matching would otherwise also catch.
export const provisionRouter = Router({ mergeParams: true });
provisionRouter.use(requireProvisioningKey);

const PROVISIONING_ACTOR = "system:provisioning-api";

interface ProvisionJudge {
  email: string;
  name: string;
  role: "JUDGE" | "PRESIDING_JUDGE" | "SECRETARY" | "OTHER_OFFICER";
}

interface ProvisionParty {
  name: string;
  email: string;
  role?: "PARTY" | "COUNSEL" | "WITNESS" | "OTHER";
}

interface ProvisionHearing {
  hearingNumber: number;
  expectedParties?: ProvisionParty[];
}

/**
 * Bulk provisioning for one meeting: the intended integration point for
 * the court's case-management system to push judges/auxiliaries and
 * scheduled hearings (with their expected parties) ahead of a hearing day
 * — this is what docs/README.md §1 means by "initial roles... assigned by
 * another system." Distinct from routes/meetings.ts's /register (which
 * only creates the bare Meeting row and IS called by the tab) — this is
 * never called by the tab, only by that external system.
 *
 * Idempotent for judges (upserted by meetingId+email — safe to re-run with
 * an updated roster). NOT idempotent for hearings: a hearingNumber that
 * already exists in this meeting is skipped rather than merged, because
 * ExpectedParty rows can already be referenced by a RemapMapping
 * (mappedToExpectedPartyId) — silently replacing them on re-provisioning
 * risks dangling references to something staff already acted on mid-
 * hearing. Skipped hearings are reported back so the caller can decide
 * whether to reconcile some other way (e.g. adding parties via
 * POST /parties instead of re-provisioning the whole hearing).
 */
provisionRouter.post("/", async (req, res) => {
  const meetingId = meetingIdParam(req);
  const {
    organizerUserId,
    onlineMeetingId,
    judges = [],
    hearings = [],
  } = req.body as {
    organizerUserId?: string;
    onlineMeetingId?: string;
    judges?: ProvisionJudge[];
    hearings?: ProvisionHearing[];
  };

  await prisma.meeting.upsert({
    where: { id: meetingId },
    create: {
      id: meetingId,
      organizerUserId: organizerUserId ?? null,
      onlineMeetingId: onlineMeetingId ?? null,
    },
    update: {
      ...(organizerUserId !== undefined ? { organizerUserId } : {}),
      ...(onlineMeetingId !== undefined ? { onlineMeetingId } : {}),
    },
  });

  const judgesUpserted: string[] = [];
  for (const j of judges) {
    const email = j.email.toLowerCase();
    await prisma.judgeOrAuxiliary.upsert({
      where: { meetingId_email: { meetingId, email } },
      create: { meetingId, email, name: j.name, role: j.role },
      update: { name: j.name, role: j.role },
    });
    judgesUpserted.push(email);
  }

  const existingNumbers = new Set(
    (
      await prisma.hearing.findMany({
        where: { meetingId, hearingNumber: { in: hearings.map((h) => h.hearingNumber) } },
        select: { hearingNumber: true },
      })
    ).map((h) => h.hearingNumber),
  );

  const hearingsCreated: number[] = [];
  const hearingsSkipped: number[] = [];
  for (const h of hearings) {
    if (existingNumbers.has(h.hearingNumber)) {
      hearingsSkipped.push(h.hearingNumber);
      continue;
    }
    const created = await prisma.hearing.create({
      data: {
        meetingId,
        hearingNumber: h.hearingNumber,
        expectedParties: {
          create: (h.expectedParties ?? []).map((p) => ({
            name: p.name,
            email: p.email.toLowerCase(),
            role: p.role ?? "PARTY",
          })),
        },
      },
    });
    hearingsCreated.push(created.hearingNumber);
  }

  await logAudit({
    meetingId,
    actorEmail: PROVISIONING_ACTOR,
    action: "meeting.provision",
    after: { judgesUpserted, hearingsCreated, hearingsSkipped },
  });

  if (judgesUpserted.length || hearingsCreated.length) {
    await broadcastState(meetingId);
  }

  res.status(hearingsSkipped.length ? 207 : 200).json({
    meetingId,
    judgesUpserted,
    hearingsCreated,
    hearingsSkipped,
  });
});
