import { useCallback, useEffect, useState } from "react";
import type { StateSnapshot } from "./types";
import { subscribeToState } from "./socket";
import { getCurrentUserEmail, getMeetingId } from "./teamsContext";
import { api } from "./api";
import { JudgesPanel } from "./components/JudgesPanel";
import { HearingsSection } from "./components/HearingsSection";
import { GeneralPublic } from "./components/GeneralPublic";

export default function App() {
  const [snapshot, setSnapshot] = useState<StateSnapshot | null>(null);
  const [myEmail, setMyEmail] = useState("unknown@local");
  const [error, setError] = useState<string | null>(null);
  // Personal, per-author notes — never part of the shared socket snapshot
  // (backend/src/routes/notes.ts). Fetched once, updated optimistically.
  const [myNotes, setMyNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    // Display-only — see teamsContext.ts. Real request identity now comes
    // from a Teams-SSO token attached per-call (api.ts / socket.ts), not
    // from this value.
    getCurrentUserEmail().then(setMyEmail);
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      // Every hearing/roster/judge lives under one Meeting row
      // (backend/prisma/schema.prisma) — this tab is useless without a
      // resolvable meeting id, so fail loudly and early rather than
      // rendering an empty dashboard that silently never loads anything.
      const meetingId = await getMeetingId();
      if (!meetingId) {
        setError(
          "Couldn't determine which Teams meeting this is. Open this tab from inside a live Teams meeting (or add ?meetingId=... for local dev).",
        );
        return;
      }

      try {
        await api.registerMeeting();
      } catch (err) {
        setError(`Failed to register this meeting with the backend: ${(err as Error).message}`);
        return;
      }

      api.getMyNotes().then(setMyNotes).catch(() => {});

      const unsub = await subscribeToState(setSnapshot);
      if (cancelled) unsub();
      else unsubscribe = unsub;
    })().catch((err) => setError((err as Error).message));

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const onNotesChange = useCallback((hearingId: string, text: string) => {
    setMyNotes((prev) => ({ ...prev, [hearingId]: text }));
    api.updateMyNotes(hearingId, text).catch((err) => {
      console.error("failed to save note", err);
    });
  }, []);

  if (error) {
    return <div className="loading error">{error}</div>;
  }

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
      {snapshot.meetingEndedAt && (
        <div className="session-ended-banner">
          ✓ Session ended {new Date(snapshot.meetingEndedAt).toLocaleTimeString()} — summaries sent
          to judges &amp; auxiliaries.
        </div>
      )}
      <JudgesPanel judges={snapshot.judges} myEmail={myEmail} />
      <HearingsSection
        hearings={snapshot.hearings}
        myNotes={myNotes}
        onNotesChange={onNotesChange}
      />
      <GeneralPublic
        entries={snapshot.generalPublic}
        remapped={snapshot.remappedIntoHearing}
        hearings={snapshot.hearings}
        presenterGrants={snapshot.presenterGrants}
      />
      {!snapshot.meetingEndedAt && (
        <button
          className="end-session-btn"
          onClick={async () => {
            if (
              !confirm(
                "End session and send every judge/auxiliary a summary of every hearing's final state, including your own notes? This can't be undone.",
              )
            ) {
              return;
            }
            try {
              await api.endSession();
            } catch (err) {
              alert((err as Error).message);
            }
          }}
        >
          End session &amp; send summaries
        </button>
      )}
    </div>
  );
}
