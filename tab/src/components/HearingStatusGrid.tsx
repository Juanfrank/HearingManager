import type { HearingView } from "../types";
import { t } from "../i18n";

/**
 * Compact at-a-glance grid — one rounded square per hearing, colored by
 * derived attendanceStatus (statusDerivation.ts) and holding just the
 * hearing number and its present/expected count. Order: ready, then
 * incomplete, then no_show (each preserving the order hearings already
 * come in — hearingNumber ascending, per stateSnapshot.ts), with
 * COMPLETED hearings moved to the end and marked with a checkmark instead
 * of their live attendance color, since a finished hearing's attendance
 * is no longer a live concern the same way a pending one's is.
 */
export function HearingStatusGrid({ hearings }: { hearings: HearingView[] }) {
  const notCompleted = hearings.filter((h) => h.state !== "COMPLETED");
  const ready = notCompleted.filter((h) => h.attendanceStatus === "ready");
  const incomplete = notCompleted.filter((h) => h.attendanceStatus === "incomplete");
  const noShow = notCompleted.filter((h) => h.attendanceStatus === "no_show");
  const completed = hearings.filter((h) => h.state === "COMPLETED");
  const ordered = [...ready, ...incomplete, ...noShow, ...completed];

  if (!ordered.length) return null;

  return (
    <div className="status-grid">
      {ordered.map((h) => {
        const isCompleted = h.state === "COMPLETED";
        const statusClass = isCompleted ? "completed" : h.attendanceStatus;
        return (
          <div
            key={h.id}
            className={`status-square ${statusClass}`}
            title={t("hearingCard.number", { number: h.hearingNumber })}
          >
            {isCompleted && <span className="grid-check">✓</span>}
            <span className="grid-num">{t("hearingsSection.gridNumber", { number: h.hearingNumber })}</span>
            <span className="grid-count">
              {t("hearingsSection.gridCount", { present: h.presentCount, expected: h.expectedCount })}
            </span>
          </div>
        );
      })}
    </div>
  );
}
