import type {
  GeneralPublicEntry,
  HearingView,
  PresenterGrantView,
  RemappedIntoHearing,
} from "../types";
import { Collapsible } from "./Collapsible";
import { api } from "../api";
import { t } from "../i18n";

// Mapping a general-public person onto a party, or turning them into a
// brand-new party, now happens on the hearing block itself (HearingCard's
// "Map to…" control on an absent party row, and its trailing "+ Add
// party" control) — this panel is presence + mic/camera access only.
export function GeneralPublic({
  entries,
  remapped,
  hearings,
  presenterGrants,
}: {
  entries: GeneralPublicEntry[];
  remapped: RemappedIntoHearing[];
  hearings: HearingView[];
  /** Active (non-revoked) ad-hoc mic/camera grants for this meeting. */
  presenterGrants: PresenterGrantView[];
}) {
  const total = entries.length + remapped.length;
  const grantByEmail = new Map(presenterGrants.map((g) => [g.email, g]));

  return (
    <Collapsible title={t("generalPublic.title")} count={total} defaultOpen>
      {/* No Call or Message icons for general public — see plan notes;
          only the mic/camera grant controls apply here. */}
      {entries.map((e) => {
        const grant = grantByEmail.get(e.email);
        return (
          <div className="general-public-entry" key={e.email}>
            <div className="participant-row">
              <span className="name-email">
                <span className="email">{e.email}</span>
              </span>
            </div>
            {grant ? (
              <div className="grant-row">
                <span className="grant-indicator">{t("generalPublic.micGranted")}</span>
                <button className="revoke-btn" onClick={() => api.revokeGrant(grant.id)}>
                  {t("generalPublic.revoke")}
                </button>
              </div>
            ) : (
              <div className="grant-row">
                <button className="grant-btn" onClick={() => api.grantPresenter(e.email)}>
                  {t("generalPublic.grantMic")}
                </button>
              </div>
            )}
          </div>
        );
      })}
      {remapped.map((r) => {
        const target = hearings.find((h) => h.id === r.hearingId);
        return (
          <div className="participant-row remapped-struck" key={r.remapId}>
            <span className="email struck">{r.email}</span>
            <span className="muted">
              {target
                ? t("generalPublic.movedTo", { number: target.hearingNumber })
                : t("generalPublic.movedToUnknown")}
            </span>
          </div>
        );
      })}
    </Collapsible>
  );
}
