import { prisma } from "../db";

/**
 * Every role change, remap, undo, and status transition gets logged here
 * with actor, timestamp, and before/after state (docs/README.md §7,
 * "Audit logging"). This data may need to hold up as a record of how a
 * hearing was actually conducted — never delete rows, never mutate them.
 *
 * meetingId is set even when hearingId isn't (e.g. a message send not tied
 * to one hearing) so the audit trail stays queryable per meeting too, not
 * just per hearing.
 */
export async function logAudit(entry: {
  meetingId?: string | null;
  hearingId?: string | null;
  actorEmail: string;
  action: string;
  before?: unknown;
  after?: unknown;
}) {
  return prisma.auditLogEntry.create({
    data: {
      meetingId: entry.meetingId ?? undefined,
      hearingId: entry.hearingId ?? undefined,
      actorEmail: entry.actorEmail,
      action: entry.action,
      before: entry.before === undefined ? undefined : (entry.before as any),
      after: entry.after === undefined ? undefined : (entry.after as any),
    },
  });
}
