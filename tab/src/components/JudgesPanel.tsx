import type { JudgeView } from "../types";
import { Collapsible } from "./Collapsible";
import { api } from "../api";

function Row({ judge, isMe }: { judge: JudgeView; isMe: boolean }) {
  const presiding = judge.role === "PRESIDING_JUDGE";
  return (
    <div className={`participant-row judge-row ${isMe ? "is-me" : ""}`}>
      <span className={`presence-dot ${judge.connected ? "connected" : ""}`} />
      <span className="name">
        {judge.name}
        {isMe && " (you)"}
        {presiding && !isMe && " (Presiding)"}
      </span>
      {!isMe && (
        <span className="row-actions">
          {/* Call only makes sense for someone not already on the call. */}
          {!judge.connected && (
            <button title="Call" onClick={() => alert("Calling is a Phase 2 feature (not yet built).")}>
              📞
            </button>
          )}
          <button
            title="Message"
            onClick={async () => {
              const text = prompt(`Message to ${judge.name}:`);
              if (text) await api.sendMessage(judge.email, text);
            }}
          >
            💬
          </button>
          {judge.connected && (
            <>
              <button title="Mute" onClick={() => api.muteParticipant(judge.email)}>
                🔇
              </button>
              <button
                title="Turn off camera"
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
    <Collapsible title="Judges & auxiliaries" defaultOpen>
      <div className="subgroup-label">Judges</div>
      {judgeRows.map((j) => (
        <Row key={j.id} judge={j} isMe={j.email === myEmail} />
      ))}
      <div className="subgroup-label">Auxiliaries</div>
      {auxRows.map((j) => (
        <Row key={j.id} judge={j} isMe={j.email === myEmail} />
      ))}
    </Collapsible>
  );
}
