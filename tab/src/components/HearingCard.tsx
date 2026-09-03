import { useEffect, useState } from "react";
import type { HearingView } from "../types";
import { api } from "../api";

function useElapsed(startedAt: string | null) {
  const [label, setLabel] = useState("00:00:00");
  useEffect(() => {
    if (!startedAt) return;
    const start = new Date(startedAt).getTime();
    const tick = () => {
      const secs = Math.max(0, Math.floor((Date.now() - start) / 1000));
      const h = String(Math.floor(secs / 3600)).padStart(2, "0");
      const m = String(Math.floor((secs % 3600) / 60)).padStart(2, "0");
      const s = String(secs % 60).padStart(2, "0");
      setLabel(`${h}:${m}:${s}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return label;
}

function periodDuration(startedAt: string, endedAt: string | null) {
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const secs = Math.max(0, Math.floor((end - new Date(startedAt).getTime()) / 1000));
  const h = String(Math.floor(secs / 3600)).padStart(2, "0");
  const m = String(Math.floor((secs % 3600) / 60)).padStart(2, "0");
  const s = String(secs % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function HearingCard({ hearing }: { hearing: HearingView }) {
  const [notes, setNotes] = useState(hearing.notes);
  const elapsed = useElapsed(hearing.state === "ACTIVE" ? hearing.activePeriodStartedAt : null);

  useEffect(() => setNotes(hearing.notes), [hearing.notes]);

  const activeRemaps = hearing.remaps.filter((r) => !r.undoneAt);

  return (
    <div className="hearing-card">
      <div className="hearing-card-header">
        <div>
          <strong>Hearing #{hearing.hearingNumber}</strong>{" "}
          <span className="muted">
            ({hearing.presentCount}/{hearing.expectedCount} present)
          </span>
          {hearing.state === "ACTIVE" && (
            <div className="active-badge">
              Active · {elapsed}
            </div>
          )}
        </div>
      </div>

      {hearing.parties.map((p) => (
        <div className="participant-row" key={p.expectedPartyId}>
          <span>{p.present ? "✓" : "✕"}</span>
          <span className="name-email">
            <span className="name">{p.email.split("@")[0]}</span>
            <span className="email">{p.email}</span>
          </span>
          {!p.present && <span className="absent-label">(absent)</span>}
          <span className="row-actions">
            <button title="Call" onClick={() => alert("Calling is a Phase 2 feature (not yet built).")}>📞</button>
            <button
              title="Message"
              onClick={async () => {
                const text = prompt(`Message to ${p.email}:`);
                if (text) await api.sendMessage(p.email, text);
              }}
            >
              💬
            </button>
          </span>
        </div>
      ))}

      {activeRemaps.map((r) => (
        <div className="participant-row remap-row" key={r.id}>
          <span>✓</span>
          <span className="name-email">
            <span className="name">{r.rosterEmail}</span>
            <span className="remap-note">
              Remapped from general public → assigned as{" "}
              {r.mappedToExpectedPartyName ?? r.newPartyName} (new party)
            </span>
          </span>
          <button title="Undo remap" onClick={() => api.undoRemap(r.id)}>
            ↩
          </button>
        </div>
      ))}

      <textarea
        placeholder="Add notes..."
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => {
          if (notes !== hearing.notes) api.updateNotes(hearing.id, notes);
        }}
      />

      {hearing.state === "ACTIVE" && (
        <button className="primary-action" onClick={() => api.completeHearing(hearing.id)}>
          Mark as completed
        </button>
      )}
      {hearing.state === "PENDING" && (
        <button className="primary-action" onClick={() => api.activateHearing(hearing.id)}>
          Set as active
        </button>
      )}
      {hearing.state === "COMPLETED" && (
        <>
          <div className="periods-history">
            {hearing.periods.map((period) => (
              <div key={period.id} className="period-row">
                <span>
                  {new Date(period.startedAt).toLocaleTimeString()} –{" "}
                  {period.endedAt ? new Date(period.endedAt).toLocaleTimeString() : "…"}
                </span>
                <span className="muted">{periodDuration(period.startedAt, period.endedAt)}</span>
              </div>
            ))}
          </div>
          <button className="primary-action" onClick={() => api.reactivateHearing(hearing.id)}>
            Reactivate
          </button>
        </>
      )}
    </div>
  );
}
