import { Router } from "express";
import { meetingIdParam } from "../util/params";
import { requireProvisioningKey } from "../auth/requireProvisioningKey";
import { importHearingData, type ImportPayload } from "../services/importHearingData";

// mergeParams: mounted at the exact path
// /api/meetings/:meetingId/provision (index.ts), BEFORE the requireTeamsUser
// blanket middleware — see index.ts for why. requireProvisioningKey is
// applied here, router-scoped, rather than in index.ts's app.use(), so it
// can never accidentally end up guarding some other meeting-scoped route
// that app.use's prefix-matching would otherwise also catch.
export const provisionRouter = Router({ mergeParams: true });
provisionRouter.use(requireProvisioningKey);

const PROVISIONING_ACTOR = "system:provisioning-api";

/**
 * Bulk provisioning for one meeting: the intended integration point for
 * the court's case-management system to PUSH judges/auxiliaries and
 * scheduled hearings (with their expected parties) to us on demand — this
 * is what docs/README.md §1 means by "initial roles... assigned by
 * another system." Distinct from routes/meetings.ts's /register (which
 * only creates the bare Meeting row and IS called by the tab) — this is
 * never called by the tab, only by that external system. See the PULL
 * counterpart in services/cmsImport.ts (the daily scheduled job) — both
 * share the same upsert semantics via services/importHearingData.ts.
 */
provisionRouter.post("/", async (req, res) => {
  const meetingId = meetingIdParam(req);
  const payload = req.body as ImportPayload;
  const result = await importHearingData(meetingId, payload, PROVISIONING_ACTOR);
  res.status(result.hearingsSkipped.length ? 207 : 200).json({ meetingId, ...result });
});
