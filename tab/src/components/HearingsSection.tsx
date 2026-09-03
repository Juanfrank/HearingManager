import type { HearingView } from "../types";
import { Collapsible } from "./Collapsible";
import { HearingCard } from "./HearingCard";

export function HearingsSection({
  hearings,
  myNotes,
  onNotesChange,
}: {
  hearings: HearingView[];
  myNotes: Record<string, string>;
  onNotesChange: (hearingId: string, text: string) => void;
}) {
  // At most one hearing can be ACTIVE at a time (backend/src/graph/
  // roleManager.ts rejects activating a second one) — pull it out of the
  // nested Ready/Incomplete/No-show groups entirely and spotlight it.
  const active = hearings.find((h) => h.state === "ACTIVE") ?? null;
  const pendingOnly = hearings.filter((h) => h.state === "PENDING");
  const completed = hearings.filter((h) => h.state === "COMPLETED");

  const ready = pendingOnly.filter((h) => h.attendanceStatus === "ready");
  const incomplete = pendingOnly.filter((h) => h.attendanceStatus === "incomplete");
  const noShow = pendingOnly.filter((h) => h.attendanceStatus === "no_show");

  const completedCount = completed.length;
  const totalCount = hearings.length;

  const card = (h: HearingView, spotlight?: boolean) => (
    <HearingCard
      key={h.id}
      hearing={h}
      notes={myNotes[h.id] ?? ""}
      onNotesChange={onNotesChange}
      spotlight={spotlight}
    />
  );

  return (
    <>
      {active && (
        <div className="spotlight-wrap">
          <div className="spotlight-label">⚖ Active hearing</div>
          {card(active, true)}
        </div>
      )}

      <div className="progress-summary">
        <div className="muted">Completed / total hearings</div>
        <div className="progress-number">
          {completedCount} / {totalCount}
        </div>
      </div>

      <Collapsible title="Pending hearings" count={pendingOnly.length} defaultOpen>
        <Collapsible title="Ready" count={ready.length} defaultOpen accent="green">
          {ready.map((h) => card(h))}
        </Collapsible>
        <Collapsible title="Incomplete" count={incomplete.length} defaultOpen accent="amber">
          {incomplete.map((h) => card(h))}
        </Collapsible>
        <Collapsible title="No show" count={noShow.length} defaultOpen accent="red">
          {noShow.map((h) => card(h))}
        </Collapsible>
      </Collapsible>

      <Collapsible title="Completed hearings" count={completed.length} defaultOpen={false}>
        {completed.map((h) => card(h))}
      </Collapsible>
    </>
  );
}
