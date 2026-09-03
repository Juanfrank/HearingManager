import { prisma } from "../db";
import { deriveHearingAttendance } from "./statusDerivation";
import { sendChatMessage } from "../graph/client";
import { logAudit } from "./auditLog";
import { t } from "../i18n";

interface HearingBase {
  hearingId: string;
  hearingNumber: number;
  label: string;
  presentCount: number;
  expectedCount: number;
  presentEmails: string[];
}

/**
 * One base attendance line per hearing, shared across every recipient
 * (only the notes section below is personalized). For a COMPLETED hearing,
 * reads the frozen snapshot roleManager.ts's completeHearing() stored on
 * its "hearing.complete" audit entry rather than recomputing live
 * attendance — attendance can drift as people leave the call after a
 * hearing has already closed, and the audit trail is meant to hold up as a
 * record of how the hearing actually went (docs/README.md §7). A hearing
 * still PENDING or ACTIVE when the session ends has no such snapshot, so
 * falls back to live attendance, clearly labeled as such.
 */
async function buildHearingBases(meetingId: string): Promise<HearingBase[]> {
  const [hearings, roster] = await Promise.all([
    prisma.hearing.findMany({
      where: { meetingId },
      include: { expectedParties: true },
      orderBy: { hearingNumber: "asc" },
    }),
    prisma.rosterEntry.findMany({ where: { meetingId } }),
  ]);

  return Promise.all(
    hearings.map(async (h): Promise<HearingBase> => {
      if (h.state === "COMPLETED") {
        const closeEntry = await prisma.auditLogEntry.findFirst({
          where: { hearingId: h.id, action: "hearing.complete" },
          orderBy: { createdAt: "desc" },
        });
        const snap = (closeEntry?.after as any)?.attendanceAtClose;
        if (snap) {
          return {
            hearingId: h.id,
            hearingNumber: h.hearingNumber,
            label: t("sessionSummary.labelCompleted"),
            presentCount: snap.presentCount,
            expectedCount: snap.expectedCount,
            presentEmails: (snap.parties as { email: string; present: boolean }[])
              .filter((p) => p.present)
              .map((p) => p.email),
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
        presentEmails: live.parties.filter((p) => p.present).map((p) => p.email),
      };
    }),
  );
}

/**
 * Sends every judge/auxiliary in this meeting ONE message summarizing
 * every hearing's final state — including, per hearing, ONLY that
 * recipient's own HearingNote, never another author's (docs/README.md —
 * "personal, per-user" notes). Called once by routes/session.ts's
 * POST /end-session.
 */
export async function sendSessionSummaries(meetingId: string, endedByEmail: string) {
  const [bases, judges, notes] = await Promise.all([
    buildHearingBases(meetingId),
    prisma.judgeOrAuxiliary.findMany({ where: { meetingId } }),
    prisma.hearingNote.findMany({
      where: { hearing: { meetingId } },
      select: { hearingId: true, authorEmail: true, text: true },
    }),
  ]);

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
      const presentLine = b.presentEmails.length ? b.presentEmails.join(", ") : t("sessionSummary.none");
      return [
        t("sessionSummary.hearingLine", { number: b.hearingNumber, label: b.label }),
        t("sessionSummary.presentLine", {
          present: presentLine,
          presentCount: b.presentCount,
          expectedCount: b.expectedCount,
        }),
        t("sessionSummary.notesLine", {
          notes: myNote?.text?.trim() ? myNote.text : t("sessionSummary.none"),
        }),
      ].join("\n");
    });

    const text =
      bases.length === 0
        ? t("sessionSummary.noHearings")
        : `${t("sessionSummary.title")}\n\n${sections.join("\n\n")}`;

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
