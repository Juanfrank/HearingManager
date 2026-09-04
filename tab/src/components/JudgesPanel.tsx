import type { JudgeView } from "../types";
import { Collapsible } from "./Collapsible";
import { api } from "../api";
import { t } from "../i18n";

// Non-bold "(role)" parenthetical shown next to every name (judges,
// auxiliaries, and — see HearingCard.tsx — parties too).
const JUDGE_ROLE_KEY = {
  JUDGE: "roles.JUDGE",
  PRESIDING_JUDGE: "roles.PRESIDING_JUDGE",
  SECRETARY: "roles.SECRETARY",
  OTHER_OFFICER: "roles.OTHER_OFFICER",
} as const;

function Row({ judge, isMe, isStaff }: { judge: JudgeView; isMe: boolean; isStaff: boolean }) {
  const roleLabel = t(JUDGE_ROLE_KEY[judge.role]);
  const parenthetical = isMe ? `${roleLabel}, ${t("judgesPanel.you")}` : roleLabel;
  return (
    <div className={`participant-row judge-row ${isMe ? "is-me" : ""}`}>
      <span className={`presence-dot ${judge.connected ? "connected" : ""}`} />
      <span className="name">{judge.name}</span>{" "}
      <span className="role-label">({parenthetical})</span>
      {/* Every action here mutates something server-side, so it's staff-only —
          a non-staff viewer sees the same row with no buttons at all
          (backend/src/auth/requireMeetingMembership.ts is the actual
          enforcement; this just avoids offering a control that would 403). */}
      {isStaff && !isMe && (
        <span className="row-actions">
          {/* Call only makes sense for someone not already on the call. */}
          {!judge.connected && (
            <button title={t("common.call")} onClick={() => alert(t("common.callPhase2"))}>
              📞
            </button>
          )}
          <button
            title={t("common.message")}
            onClick={async () => {
              const text = prompt(t("common.messagePromptTo", { name: judge.name }));
              if (text) await api.sendMessage(judge.email, text);
            }}
          >
            💬
          </button>
          {judge.connected && (
            <>
              <button title={t("common.mute")} onClick={() => api.muteParticipant(judge.email)}>
                🔇
              </button>
              <button
                title={t("common.cameraOff")}
                onClick={() => api.setParticipantCamera(judge.email, false)}
              >
                📷🚫
              </button>
            </>
          )}
        </span>
      )}
    </div>
  );
}

export function JudgesPanel({
  judges,
  myEmail,
  isStaff,
}: {
  judges: JudgeView[];
  myEmail: string;
  isStaff: boolean;
}) {
  const judgeRows = judges.filter((j) => j.role === "JUDGE" || j.role === "PRESIDING_JUDGE");
  const auxRows = judges.filter((j) => j.role === "SECRETARY" || j.role === "OTHER_OFFICER");

  return (
    <Collapsible title={t("judgesPanel.title")} defaultOpen>
      <div className="subgroup-label">{t("judgesPanel.judges")}</div>
      {judgeRows.map((j) => (
        <Row key={j.id} judge={j} isMe={j.email === myEmail} isStaff={isStaff} />
      ))}
      <div className="subgroup-label">{t("judgesPanel.auxiliaries")}</div>
      {auxRows.map((j) => (
        <Row key={j.id} judge={j} isMe={j.email === myEmail} isStaff={isStaff} />
      ))}
    </Collapsible>
  );
}
