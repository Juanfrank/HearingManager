import type { HearingView } from "../types";
import { Collapsible } from "./Collapsible";
import { HearingCard } from "./HearingCard";

export function HearingsSection({ hearings }: { hearings: HearingView[] }) {
  const pending = hearings.filter((h) => h.state === "PENDING" || h.state === "ACTIVE");
  const completed = hearings.filter((h) => h.state === "COMPLETED");

  const ready = pending.filter((h) => h.attendanceStatus === "ready");
  const incomplete = pending.filter((h) => h.attendanceStatus === "incomplete");
  const noShow = pending.filter((h) => h.attendanceStatus === "no_show");

  const completedCount = hearings.filter((h) => h.state === "COMPLETED").length;
  const totalCount = hearings.length;

  return (
    <>
      <div className="progress-summary">
        <div className="muted">Completed / total hearings</div>
        <div className="progress-number">
          {completedCount} / {totalCount}
        </div>
      </div>

      <Collapsible title="Pending hearings" count={pending.length} defaultOpen>
        <Collapsible title="Ready" count={ready.length} defaultOpen accent="green">
          {ready.map((h) => (
            <HearingCard key={h.id} hearing={h} />
          ))}
        </Collapsible>
        <Collapsible title="Incomplete" count={incomplete.length} defaultOpen accent="amber">
          {incomplete.map((h) => (
            <HearingCard key={h.id} hearing={h} />
          ))}
        </Collapsible>
        <Collapsible title="No show" count={noShow.length} defaultOpen accent="red">
          {noShow.map((h) => (
            <HearingCard key={h.id} hearing={h} />
          ))}
        </Collapsible>
      </Collapsible>

      <Collapsible title="Completed hearings" count={completed.length} defaultOpen={false}>
        {completed.map((h) => (
          <HearingCard key={h.id} hearing={h} />
        ))}
      </Collapsible>
    </>
  );
}
