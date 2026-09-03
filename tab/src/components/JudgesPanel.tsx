import type { JudgeView } from "../types";
import { Collapsible } from "./Collapsible";
import { api } from "../api";
import { t } from "../i18n";

function Row({ judge, isMe }: { judge: JudgeView; isMe: boolean }) {
  const presiding = judge.role === "PRESIDING_JUDGE";
  return (
    <div className={`participant-row judge-row ${isMe ? "is-me" : ""}`}>
      <span className={`presence-dot ${judge.connected ? "connected" : ""}`} />
      <span className="name">
        {judge.name}
        {isMe && t("judgesPanel.you")}
        {presiding && !isMe && t("judgesPanel.presiding")}
      </span>
      {!isMe && (
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

export function JudgesPanel({ judges, myEmail }: { judges: JudgeView[]; myEmail: string }) {
  const judgeRows = judges.filter((j) => j.role === "JUDGE" || j.role === "PRESIDING_JUDGE");
  const auxRows = judges.filter((j) => j.role === "SECRETARY" || j.role === "OTHER_OFFICER");

  return (
    <Collapsible title={t("judgesPanel.title")} defaultOpen>
      <div className="subgroup-label">{t("judgesPanel.judges")}</div>
      {judgeRows.map((j) => (
        <Row key={j.id} judge={j} isMe={j.email === myEmail} />
      ))}
      <div className="subgroup-label">{t("judgesPanel.auxiliaries")}</div>
      {auxRows.map((j) => (
        <Row key={j.id} judge={j} isMe={j.email === myEmail} />
      ))}
    </Collapsible>
  );
}
