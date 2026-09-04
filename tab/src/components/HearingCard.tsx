import { useEffect, useState } from "react";
import type { GeneralPublicEntry, HearingView, PartyRole } from "../types";
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

// Non-bold "(role)" parenthetical next to a party's name — same treatment
// as JudgesPanel.tsx gives judges/auxiliaries.
const PARTY_ROLE_KEY = {
  PARTY: "roles.PARTY",
  COUNSEL: "roles.COUNSEL",
  WITNESS: "roles.WITNESS",
  OTHER: "roles.OTHER",
} as const;

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

/**
 * Inline control on an absent party row — maps an unresolved
 * general-public person onto THIS specific party (backend's existing
 * remap endpoint, mappedToExpectedPartyId), which now actually flips
 * their presence (backend/src/services/statusDerivation.ts fix).
 */
function MapToControl({
  hearingId,
  expectedPartyId,
  generalPublic,
}: {
  hearingId: string;
  expectedPartyId: string;
  generalPublic: GeneralPublicEntry[];
}) {
  const [email, setEmail] = useState("");
  if (!generalPublic.length) return null;
  return (
    <span className="map-to-row">
      <select value={email} onChange={(e) => setEmail(e.target.value)}>
        <option value="">{t("hearingCard.mapToPlaceholder")}</option>
        {generalPublic.map((g) => (
          <option key={g.email} value={g.email}>
            {g.displayName || g.email}
          </option>
        ))}
      </select>
      <button
        disabled={!email}
        onClick={async () => {
          await api.createRemap({
            rosterEmail: email,
            hearingId,
            mappedToExpectedPartyId: expectedPartyId,
          });
          setEmail("");
        }}
      >
        {t("hearingCard.mapToConfirm")}
      </button>
    </span>
  );
}

/**
 * Trailing control, last item in a hearing card — turns a general-public
 * person into a brand-new ExpectedParty on this hearing (backend's
 * existing POST /parties route), with a chosen role.
 */
function AddPartyControl({
  hearingId,
  generalPublic,
}: {
  hearingId: string;
  generalPublic: GeneralPublicEntry[];
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<PartyRole | "">("");

  if (!open) {
    return (
      <div className="add-party">
        <button className="add-party-toggle" onClick={() => setOpen(true)}>
          {t("hearingCard.addParty")}
        </button>
      </div>
    );
  }

  const selected = generalPublic.find((g) => g.email === email);

  return (
    <div className="add-party">
      <div className="add-party-form">
        <select value={email} onChange={(e) => setEmail(e.target.value)}>
          <option value="">{t("hearingCard.addPartySelectPerson")}</option>
          {generalPublic.map((g) => (
            <option key={g.email} value={g.email}>
              {g.displayName || g.email}
            </option>
          ))}
        </select>
        <select value={role} onChange={(e) => setRole(e.target.value as PartyRole)}>
          <option value="">{t("hearingCard.addPartySelectRole")}</option>
          {(Object.keys(PARTY_ROLE_KEY) as PartyRole[]).map((r) => (
            <option key={r} value={r}>
              {t(PARTY_ROLE_KEY[r])}
            </option>
          ))}
        </select>
        <button
          disabled={!selected || !role}
          onClick={async () => {
            if (!selected || !role) return;
            await api.addParty(hearingId, {
              name: selected.displayName || selected.email,
              emails: [selected.email],
              role,
            });
            setOpen(false);
            setEmail("");
            setRole("");
          }}
        >
          {t("hearingCard.addPartyConfirm")}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setEmail("");
            setRole("");
          }}
        >
          {t("hearingCard.addPartyCancel")}
        </button>
      </div>
    </div>
  );
}

export function HearingCard({
  hearing,
  notes,
  onNotesChange,
  spotlight,
  generalPublic,
  isStaff,
}: {
  hearing: HearingView;
  /** This viewer's own note for this hearing — personal, never shared (backend/src/routes/notes.ts). */
  notes: string;
  onNotesChange: (hearingId: string, text: string) => void;
  spotlight?: boolean;
  /** Unresolved general-public entries — source for Map-to/Add-party controls. */
  generalPublic: GeneralPublicEntry[];
  /** See App.tsx — a non-staff viewer sees this card with no action
   * controls, no notes (a judge-only feature anyway), and no Map-to/Add-
   * party affordances. Every one of those routes is staff-only server-side
   * regardless (backend/src/auth/requireMeetingMembership.ts); this just
   * keeps the UI from offering a control that would 403. */
  isStaff: boolean;
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
            <span className="name">
              {p.name} <span className="role-label">({t(PARTY_ROLE_KEY[p.role])})</span>
            </span>
            <span className="email">{p.email}</span>
          </span>
          {!p.present && <span className="absent-label">{t("hearingCard.absent")}</span>}
          {isStaff && !p.present && (
            <MapToControl
              hearingId={hearing.id}
              expectedPartyId={p.expectedPartyId}
              generalPublic={generalPublic}
            />
          )}
          {isStaff && (
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
          )}
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
          {isStaff && (
            <button title={t("hearingCard.undoRemap")} onClick={() => api.undoRemap(r.id)}>
              ↩
            </button>
          )}
        </div>
      ))}

      {isStaff && (
        <textarea
          placeholder={t("hearingCard.notesPlaceholder")}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== notes) onNotesChange(hearing.id, draft);
          }}
        />
      )}

      {isStaff && hearing.state === "ACTIVE" && (
        <div className="action-row">
          <button className="primary-action" onClick={() => api.completeHearing(hearing.id)}>
            {t("hearingCard.markCompleted")}
          </button>
          <button
            className="primary-action secondary-action"
            onClick={() => api.returnToPending(hearing.id)}
          >
            {t("hearingCard.returnToPending")}
          </button>
        </div>
      )}
      {isStaff && hearing.state === "PENDING" && (
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
          {isStaff && (
            <div className="action-row">
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
              <button
                className="primary-action secondary-action"
                onClick={() => api.returnToPending(hearing.id)}
              >
                {t("hearingCard.returnToPending")}
              </button>
            </div>
          )}
        </>
      )}

      {isStaff && <AddPartyControl hearingId={hearing.id} generalPublic={generalPublic} />}
    </div>
  );
}
