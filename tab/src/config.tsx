import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import * as microsoftTeams from "@microsoft/teams-js";
import "./styles.css";

/**
 * Teams configurable-tab config page. This app manages a single meeting
 * (docs §1) so there's no real per-instance settings to collect — this
 * page only exists to satisfy the configurableTabs contract (pin the
 * content URL and mark the config valid) and can be swapped for
 * manifest.json's simpler `staticTabs` entry if per-instance config is
 * never needed. Kept here for whichever the deployer prefers.
 */
function ConfigPage() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    microsoftTeams.app.initialize().then(() => {
      microsoftTeams.pages.config.registerOnSaveHandler((saveEvent) => {
        microsoftTeams.pages.config.setConfig({
          entityId: "hearing-manager",
          contentUrl: `${window.location.origin}/`,
          websiteUrl: `${window.location.origin}/`,
          suggestedDisplayName: "Hearing Manager",
        });
        saveEvent.notifySuccess();
      });
      microsoftTeams.pages.config.setValidityState(true);
      setReady(true);
    });
  }, []);

  return (
    <div className="app">
      <div className="collapsible">
        <div className="collapsible-body">
          <p>
            Hearing Manager manages the sub-hearings inside <em>this</em>{" "}
            meeting — there's nothing to configure per install. Click{" "}
            <strong>Save</strong> to add it.
          </p>
          {!ready && <p className="muted">Initializing…</p>}
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigPage />
  </React.StrictMode>,
);
