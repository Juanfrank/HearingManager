import type { Request } from "express";

/**
 * Every resource router here is mounted under /api/meetings/:meetingId
 * with mergeParams: true (index.ts), so req.params.meetingId is always
 * present at runtime — but Express's route-string type inference only
 * knows about params declared in each router's OWN path literals (e.g.
 * "/:id"), not ones merged in from the parent mount path. This reads it
 * back with the actual runtime type instead of `as any`-ing it at every
 * call site.
 */
export function meetingIdParam(req: Request): string {
  return (req.params as Record<string, string>).meetingId;
}
