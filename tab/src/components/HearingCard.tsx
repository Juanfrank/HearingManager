import { useEffect, useState } from "react";
import type { HearingView } from "../types";
import { api, ApiError } from "../api";
import { t, hasKey } from "../i18n";

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

/**
 * Renders a backend ApiError (a stable {code, ...details} — backend/src/
 * routes/hearings.ts's respondError) in Spanish via i18n, instead of
 * whatever raw text the server happened to log internally.
 */
function describeApiError(err: unknown): string {
  if (err instanceof ApiError) {
    const key = `errors.${err.code}`;
    if (hasKey(key)) {
      return t(key, err.details as Record<string, string | number>);
    }
  }
  return t("errors.GENERIC");
}

export function HearingCard({
  hearing,
  notes,
  onNotesChange,
  spotlight,
}: {
  hearing: HearingView;
  /** This viewer's own note for this hearing — personal, never shared (backend/src/routes/notes.ts). */
  notes: string;
  onNotesChange: (hearingId: string, text: string) => void;
  spotlight?: boolean;
}) {
  const [draft, setDraft] = useState(notes);
  const elapsed = useElapsed(hearing.state === "ACTIVE" ? hearing.activePeriodStartedAt : null);

  useEffect(() => setDraft(notes), [notes]);

  const activeRemaps = hearing.remaps.filter((r) => !r.undoneAt);

  return (
    <div className={`hearing-card ${spotlight ? "spotlight" : ""}`}>
      <div className="hearing-card-header">
        <div>
          <strong>{t("hearingCard.number", { number: hearing.hearingNumber })}</strong>{" "}
          <span className="muted">
            {t("hearingCard.presentCount", {
              present: hearing.presentCount,
              expected: hearing.expectedCount,
            })}
          </span>
          {hearing.state === "ACTIVE" && (
            <div className="active-badge">{t("hearingCard.active", { elapsed })}</div>
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
          {!p.present && <span className="absent-label">{t("hearingCard.absent")}</span>}
          <span className="row-actions">
            {/* Call only makes sense for someone not already on the call. */}
            {!p.present && (
              <button title={t("common.call")} onClick={() => alert(t("common.callPhase2"))}>
                📞
              </button>
            )}
            <button
              title={t("common.message")}
              onClick={async () => {
                const text = prompt(t("common.messagePromptTo", { name: p.email }));
                if (text) await api.sendMessage(p.email, text);
              }}
            >
              💬
            </button>
            {p.present && (
              <>
                <button title={t("common.mute")} onClick={() => api.muteParticipant(p.email)}>
                  🔇
                </button>
                <button
                  title={t("common.cameraOff")}
                  onClick={() => api.setParticipantCamera(p.email, false)}
                >
                  📷🚫
                </button>
              </>
            )}
          </span>
        </div>
      ))}

      {activeRemaps.map((r) => (
        <div className="participant-row remap-row" key={r.id}>
          <span>✓</span>
          <span className="name-email">
            <span className="name">{r.rosterEmail}</span>
            <span className="remap-note">
              {t("hearingCard.remapNote", {
                name: r.mappedToExpectedPartyName ?? r.newPartyName ?? "",
              })}
            </span>
          </span>
          <button title={t("hearingCard.undoRemap")} onClick={() => api.undoRemap(r.id)}>
            ↩
          </button>
        </div>
      ))}

      <textarea
        placeholder={t("hearingCard.notesPlaceholder")}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== notes) onNotesChange(hearing.id, draft);
        }}
      />

      {hearing.state === "ACTIVE" && (
        <button className="primary-action" onClick={() => api.completeHearing(hearing.id)}>
          {t("hearingCard.markCompleted")}
        </button>
      )}
      {hearing.state === "PENDING" && (
        <button
          className="primary-action"
          onClick={async () => {
            try {
              await api.activateHearing(hearing.id);
            } catch (err) {
              alert(describeApiError(err));
            }
          }}
        >
          {t("hearingCard.setActive")}
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
          <button
            className="primary-action"
            onClick={async () => {
              try {
                await api.reactivateHearing(hearing.id);
              } catch (err) {
                alert(describeApiError(err));
              }
            }}
          >
            {t("hearingCard.reactivate")}
          </button>
        </>
      )}
    </div>
  );
}
