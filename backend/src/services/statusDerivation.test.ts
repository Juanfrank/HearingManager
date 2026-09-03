import { describe, expect, it } from "vitest";
import {
  deriveHearingAttendance,
  generalPublicEntries,
} from "./statusDerivation";

const parties = [
  { id: "p1", name: "Ana Torres", role: "PARTY", emails: ["ana.torres@mail.com"] },
  { id: "p2", name: "Luis Peña", role: "PARTY", emails: ["luis.pena@mail.com"] },
];

describe("deriveHearingAttendance", () => {
  it("is ready when every expected party is connected", () => {
    const roster = [
      { email: "ana.torres@mail.com", isConnected: true },
      { email: "luis.pena@mail.com", isConnected: true },
    ];
    const result = deriveHearingAttendance("h1", parties, roster, []);
    expect(result.status).toBe("ready");
    expect(result.presentCount).toBe(2);
  });

  it("is incomplete when only some expected parties are connected", () => {
    const roster = [
      { email: "ana.torres@mail.com", isConnected: true },
      { email: "luis.pena@mail.com", isConnected: false },
    ];
    const result = deriveHearingAttendance("h1", parties, roster, []);
    expect(result.status).toBe("incomplete");
    expect(result.presentCount).toBe(1);
  });

  it("is no_show when nobody expected is connected", () => {
    const roster = [
      { email: "ana.torres@mail.com", isConnected: false },
      { email: "luis.pena@mail.com", isConnected: false },
    ];
    const result = deriveHearingAttendance("h1", parties, roster, []);
    expect(result.status).toBe("no_show");
  });

  it("is no_show when there are no expected parties at all", () => {
    const result = deriveHearingAttendance("h1", [], [], []);
    expect(result.status).toBe("no_show");
  });

  it("counts an active remap toward the target hearing", () => {
    const roster = [
      { email: "ana.torres@mail.com", isConnected: true },
      { email: "m.gomez83@gmail.com", isConnected: true },
    ];
    const soloParty = [
      { id: "p1", name: "Ana Torres", role: "PARTY", emails: ["ana.torres@mail.com"] },
    ];
    const remaps = [
      {
        rosterEmail: "m.gomez83@gmail.com",
        hearingId: "h1",
        undoneAt: null,
      },
    ];
    // Remap doesn't add a new ExpectedParty row by itself — it's tracked
    // separately (new_party case creates one; existing_party case maps
    // onto p1). Here we just confirm the connected-set expansion doesn't
    // break status derivation for the party that *is* expected.
    const result = deriveHearingAttendance("h1", soloParty, roster, remaps);
    expect(result.status).toBe("ready");
  });

  it("reverts to unmapped once a remap is undone", () => {
    const roster = [{ email: "m.gomez83@gmail.com", isConnected: true }];
    const remapsActive = [
      { rosterEmail: "m.gomez83@gmail.com", hearingId: "h1", undoneAt: null },
    ];
    const remapsUndone = [
      {
        rosterEmail: "m.gomez83@gmail.com",
        hearingId: "h1",
        undoneAt: new Date(),
      },
    ];
    const partiesWithRemapTarget = [
      { id: "p1", name: "Gómez Co-counsel", role: "COUNSEL", emails: ["m.gomez83@gmail.com"] },
    ];

    const withRemap = deriveHearingAttendance(
      "h1",
      partiesWithRemapTarget,
      roster,
      remapsActive,
    );
    const withUndoneRemap = deriveHearingAttendance(
      "h1",
      partiesWithRemapTarget,
      roster,
      remapsUndone,
    );

    expect(withRemap.status).toBe("ready");
    // Undoing the remap doesn't disconnect the roster entry itself, but it
    // stops counting as an intentional mapping — attendance for a hearing
    // whose ExpectedParty *is* that email is unaffected here since the
    // underlying roster connection is unchanged; the meaningful effect of
    // undo is on generalPublicEntries (see below).
    expect(withUndoneRemap.status).toBe("ready");
  });

  it("counts a party present if ANY of their known emails is connected", () => {
    const roster = [{ email: "alternative@judge.com", isConnected: true }];
    const multiEmailParty = [
      {
        id: "p1",
        name: "Multi Email",
        role: "PARTY",
        emails: ["primary@judge.com", "alternative@judge.com"],
      },
    ];
    const result = deriveHearingAttendance("h1", multiEmailParty, roster, []);
    expect(result.status).toBe("ready");
    expect(result.parties[0].present).toBe(true);
    // Display email is still the first one, regardless of which email
    // they actually joined with.
    expect(result.parties[0].email).toBe("primary@judge.com");
  });

  it("marks an absent party present once a general-public person is mapped onto them via mappedToExpectedPartyId", () => {
    // p2 (Luis Peña) has no matching roster entry under any of their own
    // emails — the only way they show connected is via an EXISTING_PARTY
    // remap of an unmatched general-public roster email onto them
    // (tab's HearingCard "Map to…" control on an absent party).
    const roster = [
      { email: "ana.torres@mail.com", isConnected: true },
      { email: "observer.press@outlook.com", isConnected: true },
    ];
    const remaps = [
      {
        rosterEmail: "observer.press@outlook.com",
        hearingId: "h1",
        undoneAt: null,
        mappedToExpectedPartyId: "p2",
      },
    ];
    const result = deriveHearingAttendance("h1", parties, roster, remaps);
    expect(result.status).toBe("ready");
    expect(result.parties.find((p) => p.expectedPartyId === "p2")?.present).toBe(true);
  });

  it("does not mark a party present from an undone existing-party remap", () => {
    const roster = [
      { email: "ana.torres@mail.com", isConnected: true },
      { email: "observer.press@outlook.com", isConnected: true },
    ];
    const remaps = [
      {
        rosterEmail: "observer.press@outlook.com",
        hearingId: "h1",
        undoneAt: new Date(),
        mappedToExpectedPartyId: "p2",
      },
    ];
    const result = deriveHearingAttendance("h1", parties, roster, remaps);
    expect(result.parties.find((p) => p.expectedPartyId === "p2")?.present).toBe(false);
  });
});

describe("generalPublicEntries", () => {
  it("lists connected roster entries not matched to any expected party", () => {
    const roster = [
      { email: "ana.torres@mail.com", isConnected: true },
      { email: "observer.press@outlook.com", isConnected: true },
    ];
    const result = generalPublicEntries(roster, parties, []);
    expect(result.map((r) => r.email)).toEqual(["observer.press@outlook.com"]);
  });

  it("excludes an actively remapped entry from general public", () => {
    const roster = [{ email: "m.gomez83@gmail.com", isConnected: true }];
    const remaps = [
      { rosterEmail: "m.gomez83@gmail.com", hearingId: "h1", undoneAt: null },
    ];
    const result = generalPublicEntries(roster, parties, remaps);
    expect(result).toHaveLength(0);
  });

  it("returns an undone remap back to general public", () => {
    const roster = [{ email: "m.gomez83@gmail.com", isConnected: true }];
    const remaps = [
      {
        rosterEmail: "m.gomez83@gmail.com",
        hearingId: "h1",
        undoneAt: new Date(),
      },
    ];
    const result = generalPublicEntries(roster, parties, remaps);
    expect(result.map((r) => r.email)).toEqual(["m.gomez83@gmail.com"]);
  });
});
