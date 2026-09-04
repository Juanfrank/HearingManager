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
      // before/after are plain NVarChar(Max) columns, not Json — SQL
      // Server's Prisma connector has no Json column type (docs/README.md
      // "Database"). JSON.stringify here is the one place this app
      // serializes them; parseAuditJson below is the one place it parses
      // them back.
      before: entry.before === undefined ? undefined : JSON.stringify(entry.before),
      after: entry.after === undefined ? undefined : JSON.stringify(entry.after),
    },
  });
}

/** Parses an AuditLogEntry.before/after column back into the object that
 * was passed to logAudit() — null/undefined pass through unchanged. */
export function parseAuditJson(value: string | null | undefined): any {
  if (value == null) return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
