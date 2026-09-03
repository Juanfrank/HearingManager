import { fetchHearingsForDate } from "./cmsClient";
import { parseCmsRows } from "./cmsImport";
import { importHearingData } from "./importHearingData";

const IMPORT_ACTOR = "system:cms-daily-import";
// Server-local hour (0-23) to run at — deliberately simple (no cron
// expression parsing, no extra dependency) since this only ever needs to
// fire once a day. Deployers running in a specific timezone should set the
// process's TZ env var accordingly.
const DAILY_IMPORT_HOUR = Number(process.env.DAILY_IMPORT_HOUR ?? "1");
const CHECK_INTERVAL_MS = 60_000;

let lastRunDateKey: string | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function tomorrowDateString(from: Date): string {
  const t = new Date(from);
  t.setDate(t.getDate() + 1);
  return dateKey(t);
}

/**
 * Pulls TOMORROW's hearings from the case-management system
 * (cmsClient.ts), groups them per meeting (cmsImport.ts), and upserts each
 * one (services/importHearingData.ts — the same upsert path
 * routes/provision.ts uses). Exported separately from the scheduler loop
 * below so it's directly callable — both by the daily timer and by
 * routes/admin.ts's manual-trigger endpoint for ops/testing.
 */
export async function runDailyImportNow(): Promise<{
  targetDate: string;
  meetingsImported: string[];
  errors: { meetingId: string; error: string }[];
}> {
  const targetDate = tomorrowDateString(new Date());
  console.log(`[cms-import] fetching hearings for ${targetDate}`);
  const rows = await fetchHearingsForDate(targetDate);
  const payloads = parseCmsRows(rows);

  const meetingsImported: string[] = [];
  const errors: { meetingId: string; error: string }[] = [];
  // Each meeting imported independently — one bad meeting's data (a
  // missing field, an unexpected shape) shouldn't block every other
  // meeting scheduled for the same day.
  for (const [meetingId, payload] of payloads) {
    try {
      await importHearingData(meetingId, payload, IMPORT_ACTOR);
      meetingsImported.push(meetingId);
    } catch (err) {
      console.error(`[cms-import] failed to import meeting ${meetingId}`, err);
      errors.push({ meetingId, error: (err as Error).message });
    }
  }

  return { targetDate, meetingsImported, errors };
}

/**
 * Starts the daily check loop — call once at server boot (index.ts).
 * Polls every minute rather than scheduling a single far-future timeout,
 * so it stays correct across the server being restarted, the system clock
 * changing, or a run being skipped by `lastRunDateKey` after a crash mid-
 * hour — the next matching minute just picks it back up, at most a day
 * late in the worst case.
 */
export function startDailyImportScheduler() {
  if (timer) return;
  timer = setInterval(() => {
    const now = new Date();
    if (now.getHours() !== DAILY_IMPORT_HOUR) return;
    const key = dateKey(now);
    if (key === lastRunDateKey) return; // already ran today
    lastRunDateKey = key;
    runDailyImportNow().catch((err) => {
      console.error("[cms-import] daily run failed", err);
    });
  }, CHECK_INTERVAL_MS);
  console.log(
    `[cms-import] daily scheduler started — runs at hour ${DAILY_IMPORT_HOUR} (server-local time)`,
  );
}
