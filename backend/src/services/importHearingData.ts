import { prisma } from "../db";
import { logAudit } from "./auditLog";
import { broadcastState } from "../ws";
import { externalUidOrSynthetic } from "../util/identity";

export interface ImportJudge {
  externalUid?: string;
  emails: string[];
  name: string;
  role: "JUDGE" | "PRESIDING_JUDGE" | "SECRETARY" | "OTHER_OFFICER";
}

export interface ImportParty {
  externalUid?: string;
  emails: string[];
  name: string;
  role?: "PARTY" | "COUNSEL" | "WITNESS" | "OTHER";
}

export interface ImportHearing {
  hearingNumber: number;
  scheduledAt?: Date;
  expectedParties?: ImportParty[];
}

export interface ImportPayload {
  organizerUserId?: string;
  onlineMeetingId?: string;
  judges?: ImportJudge[];
  hearings?: ImportHearing[];
}

/**
 * Bulk upsert for one meeting's judges/auxiliaries and scheduled hearings
 * (+ expected parties) — the ONE place this logic lives, shared by both
 * integration paths that populate it (docs/README.md "Provisioning" and
 * "Daily case-management import"):
 *   - routes/provision.ts: the case-management system PUSHES data to us
 *     on demand, authenticated with an X-Api-Key.
 *   - services/cmsImport.ts + the daily scheduler: we PULL tomorrow's
 *     hearings FROM the case-management system on a timer.
 * Both end up with the same shape and the same idempotency rules, so
 * there's exactly one place that decides what "re-running this" means.
 *
 * Idempotent for judges (upserted by meetingId+externalUid — safe to
 * re-run with an updated roster). NOT idempotent for hearings: a
 * hearingNumber that already exists in this meeting is skipped rather
 * than merged, because ExpectedParty rows can already be referenced by a
 * RemapMapping (mappedToExpectedPartyId) — silently replacing them on
 * re-import risks dangling references to something staff already acted
 * on mid-hearing. Skipped hearings are reported back so the caller can
 * decide whether to reconcile some other way (e.g. adding parties via
 * POST /parties instead of re-importing the whole hearing).
 */
export async function importHearingData(
  meetingId: string,
  payload: ImportPayload,
  actorEmail: string,
): Promise<{ judgesUpserted: string[]; hearingsCreated: number[]; hearingsSkipped: number[] }> {
  const { organizerUserId, onlineMeetingId, judges = [], hearings = [] } = payload;

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
    const normalizedEmails = j.emails.map((e) => e.toLowerCase());
    const uid = externalUidOrSynthetic(j.externalUid, normalizedEmails[0]);
    await prisma.judgeOrAuxiliary.upsert({
      where: { meetingId_externalUid: { meetingId, externalUid: uid } },
      create: { meetingId, emails: normalizedEmails, name: j.name, role: j.role, externalUid: uid },
      update: { emails: normalizedEmails, name: j.name, role: j.role },
    });
    judgesUpserted.push(uid);
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
        scheduledAt: h.scheduledAt ?? null,
        expectedParties: {
          create: (h.expectedParties ?? []).map((p) => {
            const normalizedEmails = p.emails.map((e) => e.toLowerCase());
            return {
              name: p.name,
              emails: normalizedEmails,
              role: p.role ?? "PARTY",
              externalUid: externalUidOrSynthetic(p.externalUid, normalizedEmails[0]),
            };
          }),
        },
      },
    });
    hearingsCreated.push(created.hearingNumber);
  }

  await logAudit({
    meetingId,
    actorEmail,
    action: "meeting.import",
    after: { judgesUpserted, hearingsCreated, hearingsSkipped },
  });

  if (judgesUpserted.length || hearingsCreated.length) {
    await broadcastState(meetingId);
  }

  return { judgesUpserted, hearingsCreated, hearingsSkipped };
}
