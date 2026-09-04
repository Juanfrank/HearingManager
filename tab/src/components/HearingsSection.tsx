import type { GeneralPublicEntry, HearingView } from "../types";
import { Collapsible } from "./Collapsible";
import { HearingCard } from "./HearingCard";
import { t } from "../i18n";

export function HearingsSection({
  hearings,
  myNotes,
  onNotesChange,
  generalPublic,
  isStaff,
}: {
  hearings: HearingView[];
  myNotes: Record<string, string>;
  onNotesChange: (hearingId: string, text: string) => void;
  /** Unresolved general-public entries — source list for a hearing card's
   * "Map to…" (on an absent party) and "+ Add party" controls. */
  generalPublic: GeneralPublicEntry[];
  /** See App.tsx — a non-staff viewer sees every hearing card with no
   * action controls at all. */
  isStaff: boolean;
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
      generalPublic={generalPublic}
      isStaff={isStaff}
    />
  );

  return (
    <>
      {active && (
        <div className="spotlight-wrap">
          <div className="spotlight-label">{t("hearingsSection.activeHearing")}</div>
          {card(active, true)}
        </div>
      )}

      <div className="progress-summary">
        <div className="muted">{t("hearingsSection.completedTotal")}</div>
        <div className="progress-number">
          {completedCount} / {totalCount}
        </div>
      </div>

      <Collapsible title={t("hearingsSection.pending")} count={pendingOnly.length} defaultOpen>
        <Collapsible title={t("hearingsSection.ready")} count={ready.length} defaultOpen accent="green">
          {ready.map((h) => card(h))}
        </Collapsible>
        <Collapsible
          title={t("hearingsSection.incomplete")}
          count={incomplete.length}
          defaultOpen
          accent="amber"
        >
          {incomplete.map((h) => card(h))}
        </Collapsible>
        <Collapsible title={t("hearingsSection.noShow")} count={noShow.length} defaultOpen accent="red">
          {noShow.map((h) => card(h))}
        </Collapsible>
      </Collapsible>

      <Collapsible title={t("hearingsSection.completed")} count={completed.length} defaultOpen={false}>
        {completed.map((h) => card(h))}
      </Collapsible>
    </>
  );
}
