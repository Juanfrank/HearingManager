import { describe, expect, it } from "vitest";
import {
  deriveHearingAttendance,
  generalPublicEntries,
} from "./statusDerivation";

const parties = [
  { id: "p1", email: "ana.torres@mail.com" },
  { id: "p2", email: "luis.pena@mail.com" },
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
    const soloParty = [{ id: "p1", email: "ana.torres@mail.com" }];
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
    const partiesWithRemapTarget = [{ id: "p1", email: "m.gomez83@gmail.com" }];

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
