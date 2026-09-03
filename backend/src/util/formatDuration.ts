/**
 * HH:MM:SS formatter for a millisecond duration — shared by
 * services/sessionSummary.ts (per-hearing total duration and period
 * spans) and available for any other place that needs the same format.
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}
