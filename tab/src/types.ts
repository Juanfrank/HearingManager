export type AttendanceStatus = "ready" | "incomplete" | "no_show";
export type HearingLifecycleState = "PENDING" | "ACTIVE" | "COMPLETED";

export interface PartyPresence {
  expectedPartyId: string;
  email: string;
  present: boolean;
}

export interface HearingPeriodView {
  id: string;
  startedAt: string;
  endedAt: string | null;
}

export interface RemapView {
  id: string;
  rosterEmail: string;
  mappedToType: "EXISTING_PARTY" | "NEW_PARTY";
  mappedToExpectedPartyName: string | null;
  newPartyName: string | null;
  undoneAt: string | null;
}

export interface HearingView {
  id: string;
  hearingNumber: number;
  state: HearingLifecycleState;
  attendanceStatus: AttendanceStatus;
  presentCount: number;
  expectedCount: number;
  notes: string;
  parties: PartyPresence[];
  periods: HearingPeriodView[];
  activePeriodStartedAt: string | null;
  remaps: RemapView[];
}

export interface JudgeView {
  id: string;
  email: string;
  name: string;
  role: "JUDGE" | "PRESIDING_JUDGE" | "SECRETARY" | "OTHER_OFFICER";
}

export interface GeneralPublicEntry {
  email: string;
  displayName: string;
}

export interface RemappedIntoHearing {
  email: string;
  hearingId: string;
  remapId: string;
}

export interface StateSnapshot {
  generatedAt: string;
  rosterStale: boolean;
  judges: JudgeView[];
  hearings: HearingView[];
  generalPublic: GeneralPublicEntry[];
  remappedIntoHearing: RemappedIntoHearing[];
}
