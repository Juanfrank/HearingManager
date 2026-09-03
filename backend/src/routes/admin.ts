import { Router } from "express";
import { requireProvisioningKey } from "../auth/requireProvisioningKey";
import { runDailyImportNow } from "../services/dailyImportScheduler";

// NOT meeting-scoped (a single run can touch many meetings at once), so
// this sits outside /api/meetings/:meetingId entirely rather than risking
// the app.use prefix-matching trap routes/provision.ts's comments warn
// about. Protected by the same system-level credential as provisioning —
// this is another server-to-server action, not a Teams user one.
export const adminRouter = Router();
adminRouter.use(requireProvisioningKey);

/**
 * Manually fires the daily case-management import (services/
 * dailyImportScheduler.ts) right now instead of waiting for its scheduled
 * hour — for ops/testing. The scheduled run calls the exact same function.
 */
adminRouter.post("/run-daily-import", async (_req, res) => {
  try {
    const result = await runDailyImportNow();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
