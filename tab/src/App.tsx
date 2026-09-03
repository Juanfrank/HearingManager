import { useEffect, useState } from "react";
import type { StateSnapshot } from "./types";
import { subscribeToState } from "./socket";
import { getCurrentUserEmail } from "./teamsContext";
import { setActorEmail } from "./api";
import { JudgesPanel } from "./components/JudgesPanel";
import { HearingsSection } from "./components/HearingsSection";
import { GeneralPublic } from "./components/GeneralPublic";

export default function App() {
  const [snapshot, setSnapshot] = useState<StateSnapshot | null>(null);
  const [myEmail, setMyEmail] = useState("unknown@local");

  useEffect(() => {
    getCurrentUserEmail().then((email) => {
      setMyEmail(email);
      setActorEmail(email);
    });
  }, []);

  useEffect(() => subscribeToState(setSnapshot), []);

  if (!snapshot) {
    return <div className="loading">Connecting…</div>;
  }

  return (
    <div className="app">
      {snapshot.rosterStale && (
        <div className="stale-banner">
          ⚠ Roster connection may be stale — presence shown below may be out of date.
        </div>
      )}
      <JudgesPanel judges={snapshot.judges} myEmail={myEmail} />
      <HearingsSection hearings={snapshot.hearings} />
      <GeneralPublic
        entries={snapshot.generalPublic}
        remapped={snapshot.remappedIntoHearing}
        hearings={snapshot.hearings}
      />
    </div>
  );
}
