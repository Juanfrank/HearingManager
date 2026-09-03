import { prisma } from "../db";
import { deriveHearingAttendance } from "./statusDerivation";
import { sendChatMessage } from "../graph/client";
import { logAudit } from "./auditLog";
import { formatDuration } from "../util/formatDuration";
import { t } from "../i18n";

interface PersonRef {
  name: string;
  email: string;
}

interface PeriodSpan {
  startedAt: Date;
  endedAt: Date | null;
}

interface HearingBase {
  hearingId: string;
  hearingNumber: number;
  label: string;
  presentCount: number;
  expectedCount: number;
  present: PersonRef[];
  absent: PersonRef[];
  periods: PeriodSpan[];
  totalDurationMs: number;
}

function sumDurationMs(periods: PeriodSpan[]): number {
  const now = Date.now();
  return periods.reduce(
    (sum, p) => sum + ((p.endedAt ? p.endedAt.getTime() : now) - p.startedAt.getTime()),
    0,
  );
}

/**
 * One base attendance line per hearing, shared across every recipient
 * (only the notes section elsewhere is personalized). For a COMPLETED
 * hearing, reads the frozen snapshot roleManager.ts's completeHearing()
 * stored on its "hearing.complete" audit entry rather than recomputing
 * live attendance — attendance can drift as people leave the call after a
 * hearing has already closed, and the audit trail is meant to hold up as a
 * record of how the hearing actually went (docs/README.md §7). A hearing
 * still PENDING or ACTIVE when the session ends has no such snapshot, so
 * falls back to live attendance, clearly labeled as such. Periods are
 * always read live — they never change once a hearing closes (short of a
 * later reactivate, an edge case not tracked further here).
 */
async function buildHearingBases(meetingId: string): Promise<HearingBase[]> {
  const [hearings, roster] = await Promise.all([
    prisma.hearing.findMany({
      where: { meetingId },
      include: {
        expectedParties: true,
        periods: { orderBy: { startedAt: "asc" } },
      },
      orderBy: { hearingNumber: "asc" },
    }),
    prisma.rosterEntry.findMany({ where: { meetingId } }),
  ]);

  return Promise.all(
    hearings.map(async (h): Promise<HearingBase> => {
      const periods = h.periods.map((p) => ({ startedAt: p.startedAt, endedAt: p.endedAt }));
      const totalDurationMs = sumDurationMs(periods);

      if (h.state === "COMPLETED") {
        const closeEntry = await prisma.auditLogEntry.findFirst({
          where: { hearingId: h.id, action: "hearing.complete" },
          orderBy: { createdAt: "desc" },
        });
        const snap = (closeEntry?.after as any)?.attendanceAtClose;
        if (snap) {
          const snapParties = snap.parties as {
            name: string;
            email: string;
            present: boolean;
          }[];
          return {
            hearingId: h.id,
            hearingNumber: h.hearingNumber,
            label: t("sessionSummary.labelCompleted"),
            presentCount: snap.presentCount,
            expectedCount: snap.expectedCount,
            present: snapParties.filter((p) => p.present).map((p) => ({ name: p.name, email: p.email })),
            absent: snapParties.filter((p) => !p.present).map((p) => ({ name: p.name, email: p.email })),
            periods,
            totalDurationMs,
          };
        }
      }

      const remaps = await prisma.remapMapping.findMany({
        where: { hearingId: h.id, undoneAt: null },
      });
      const live = deriveHearingAttendance(h.id, h.expectedParties, roster, remaps);
      const label =
        h.state === "ACTIVE"
          ? t("sessionSummary.labelActive")
          : t("sessionSummary.labelPending");
      return {
        hearingId: h.id,
        hearingNumber: h.hearingNumber,
        label,
        presentCount: live.presentCount,
        expectedCount: live.expectedCount,
        present: live.parties.filter((p) => p.present).map((p) => ({ name: p.name, email: p.email })),
        absent: live.parties.filter((p) => !p.present).map((p) => ({ name: p.name, email: p.email })),
        periods,
        totalDurationMs,
      };
    }),
  );
}

interface AttendanceLogPerson {
  email: string;
  displayName: string;
  events: { type: "JOINED" | "LEFT"; occurredAt: Date }[];
}

/**
 * Every participant's connect/disconnect history — judges, parties, AND
 * general public alike, since RosterConnectionEvent (unlike RosterEntry)
 * is an append-only log fed by the one roster-event code path every
 * connection change goes through regardless of role (routes/roster.ts's
 * applyRosterEvent). Shared across every recipient, not personalized.
 */
async function buildAttendanceLog(meetingId: string): Promise<AttendanceLogPerson[]> {
  const events = await prisma.rosterConnectionEvent.findMany({
    where: { meetingId },
    orderBy: [{ email: "asc" }, { occurredAt: "asc" }],
  });

  const byEmail = new Map<string, AttendanceLogPerson>();
  for (const e of events) {
    let entry = byEmail.get(e.email);
    if (!entry) {
      entry = { email: e.email, displayName: e.displayName, events: [] };
      byEmail.set(e.email, entry);
    }
    // Keep the most recent displayName seen for this email.
    entry.displayName = e.displayName;
    entry.events.push({ type: e.type, occurredAt: e.occurredAt });
  }
  return Array.from(byEmail.values());
}

/**
 * Raw, untranslated system log for auditing purposes — every AuditLogEntry
 * for this meeting, chronological. Deliberately not turned into prose:
 * it's a technical record, not a narrative, and stays identical for every
 * recipient.
 */
async function buildAuditLogLines(meetingId: string): Promise<string[]> {
  const entries = await prisma.auditLogEntry.findMany({
    where: { meetingId },
    orderBy: { createdAt: "asc" },
  });
  return entries.map((e) =>
    t("sessionSummary.auditLogLine", {
      time: e.createdAt.toLocaleString(),
      actor: e.actorEmail,
      action: e.action,
    }),
  );
}

function formatPersonList(people: PersonRef[]): string {
  return people.length ? people.map((p) => p.name || p.email).join(", ") : t("sessionSummary.none");
}

function formatPeriodsBlock(periods: PeriodSpan[]): string {
  if (!periods.length) return "";
  const lines = periods.map((p) =>
    t("sessionSummary.periodLine", {
      start: p.startedAt.toLocaleTimeString(),
      end: p.endedAt ? p.endedAt.toLocaleTimeString() : "…",
      duration: formatDuration((p.endedAt ? p.endedAt.getTime() : Date.now()) - p.startedAt.getTime()),
    }),
  );
  return `${t("sessionSummary.periodsHeader")}\n${lines.join("\n")}`;
}

function formatAttendanceLogBlock(people: AttendanceLogPerson[]): string {
  if (!people.length) return "";
  const lines = people.map((p) => {
    const eventLines = p.events.map((e) =>
      e.type === "JOINED"
        ? t("sessionSummary.attendanceLogJoined", { time: e.occurredAt.toLocaleString() })
        : t("sessionSummary.attendanceLogLeft", { time: e.occurredAt.toLocaleString() }),
    );
    return [
      t("sessionSummary.attendanceLogPerson", { name: p.displayName, email: p.email }),
      ...eventLines,
    ].join("\n");
  });
  return `${t("sessionSummary.attendanceLogHeader")}\n${lines.join("\n\n")}`;
}

function formatAuditLogBlock(lines: string[]): string {
  if (!lines.length) return "";
  return `${t("sessionSummary.auditLogHeader")}\n${lines.join("\n")}`;
}

/**
 * Sends every judge/auxiliary in this meeting ONE message summarizing
 * every hearing's final state — present/absent parties by name, total
 * active duration, and each activation time-span — plus a shared
 * participant connection log (everyone, including general public) and a
 * raw system audit log at the bottom. Per hearing, includes ONLY that
 * recipient's own HearingNote, never another author's (docs/README.md —
 * "personal, per-user" notes). Called once by routes/session.ts's
 * POST /end-session.
 */
export async function sendSessionSummaries(meetingId: string, endedByEmail: string) {
  const [bases, judges, notes, attendanceLog, auditLines] = await Promise.all([
    buildHearingBases(meetingId),
    prisma.judgeOrAuxiliary.findMany({ where: { meetingId } }),
    prisma.hearingNote.findMany({
      where: { hearing: { meetingId } },
      select: { hearingId: true, authorEmail: true, text: true },
    }),
    buildAttendanceLog(meetingId),
    buildAuditLogLines(meetingId),
  ]);

  const attendanceLogBlock = formatAttendanceLogBlock(attendanceLog);
  const auditLogBlock = formatAuditLogBlock(auditLines);

  const recipients: string[] = [];
  for (const judge of judges) {
    // A judge's HearingNote may be authored under ANY of their known
    // emails — whichever one Teams SSO resolved as their actorEmail at
    // the time they typed it (auth/verifyTeamsToken.ts), not necessarily
    // their first/primary listed email — so match against the whole set.
    const judgeEmails = new Set(judge.emails.map((e) => e.toLowerCase()));
    const sections = bases.map((b) => {
      const myNote = notes.find(
        (n) => n.hearingId === b.hearingId && judgeEmails.has(n.authorEmail.toLowerCase()),
      );
      const periodsBlock = formatPeriodsBlock(b.periods);
      return [
        t("sessionSummary.hearingLine", { number: b.hearingNumber, label: b.label }),
        t("sessionSummary.presentLine", {
          present: formatPersonList(b.present),
          presentCount: b.presentCount,
          expectedCount: b.expectedCount,
        }),
        t("sessionSummary.absentLine", { absent: formatPersonList(b.absent) }),
        t("sessionSummary.durationLine", { duration: formatDuration(b.totalDurationMs) }),
        ...(periodsBlock ? [periodsBlock] : []),
        t("sessionSummary.notesLine", {
          notes: myNote?.text?.trim() ? myNote.text : t("sessionSummary.none"),
        }),
      ].join("\n");
    });

    const bodyBlocks = [
      ...(bases.length === 0 ? [t("sessionSummary.noHearings")] : sections),
      ...(attendanceLogBlock ? [attendanceLogBlock] : []),
      ...(auditLogBlock ? [auditLogBlock] : []),
    ];

    const text = `${t("sessionSummary.title")}\n\n${bodyBlocks.join("\n\n")}`;

    const primaryEmail = judge.emails[0];
    await sendChatMessage(primaryEmail, "system:session-summary", text);
    recipients.push(primaryEmail);
  }

  await logAudit({
    meetingId,
    actorEmail: endedByEmail,
    action: "meeting.endSession",
    after: { recipients },
  });

  return recipients;
}
