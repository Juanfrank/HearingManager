import { useState } from "react";
import type {
  GeneralPublicEntry,
  HearingView,
  PresenterGrantView,
  RemappedIntoHearing,
} from "../types";
import { Collapsible } from "./Collapsible";
import { api } from "../api";
import { t } from "../i18n";

function MapAsControl({ email, hearings }: { email: string; hearings: HearingView[] }) {
  const [hearingId, setHearingId] = useState("");
  const [partyId, setPartyId] = useState("");
  const [newName, setNewName] = useState("");

  const hearing = hearings.find((h) => h.id === hearingId);

  return (
    <div className="map-as-row">
      <select value={hearingId} onChange={(e) => { setHearingId(e.target.value); setPartyId(""); }}>
        <option value="">{t("generalPublic.mapAs")}</option>
        {hearings.map((h) => (
          <option key={h.id} value={h.id}>
            {t("hearingCard.number", { number: h.hearingNumber })}
          </option>
        ))}
      </select>
      {hearing && (
        <>
          <select value={partyId} onChange={(e) => { setPartyId(e.target.value); setNewName(""); }}>
            <option value="">{t("generalPublic.existingParty")}</option>
            {hearing.parties.map((p) => (
              <option key={p.expectedPartyId} value={p.expectedPartyId}>
                {p.email}
              </option>
            ))}
          </select>
          <input
            placeholder={t("generalPublic.newPartyName")}
            value={newName}
            onChange={(e) => { setNewName(e.target.value); setPartyId(""); }}
          />
          <button
            disabled={!partyId && !newName}
            onClick={async () => {
              await api.createRemap({
                rosterEmail: email,
                hearingId,
                mappedToExpectedPartyId: partyId || undefined,
                newPartyName: newName || undefined,
              });
              setHearingId("");
              setPartyId("");
              setNewName("");
            }}
          >
            {t("generalPublic.assign")}
          </button>
        </>
      )}
    </div>
  );
}

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
            <MapAsControl email={e.email} hearings={hearings} />
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
