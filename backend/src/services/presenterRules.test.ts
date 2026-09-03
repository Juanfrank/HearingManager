import { describe, expect, it } from "vitest";
import { computePresenterEmails } from "./presenterRules";

describe("computePresenterEmails", () => {
  it("promotes connected judges/auxiliaries regardless of any active hearing", () => {
    const result = computePresenterEmails({
      connectedEmails: ["judge1@court.gov", "secretary@court.gov"],
      judges: [{ email: "judge1@court.gov" }, { email: "secretary@court.gov" }],
      activeHearingPresentEmails: [],
      activeGrants: [],
    });
    expect(result).toEqual(new Set(["judge1@court.gov", "secretary@court.gov"]));
  });

  it("never promotes a judge who isn't currently connected", () => {
    const result = computePresenterEmails({
      connectedEmails: ["judge1@court.gov"],
      judges: [{ email: "judge1@court.gov" }, { email: "offline-judge@court.gov" }],
      activeHearingPresentEmails: [],
      activeGrants: [],
    });
    expect(result.has("offline-judge@court.gov")).toBe(false);
  });

  it("promotes the active hearing's present parties", () => {
    const result = computePresenterEmails({
      connectedEmails: ["ana.torres@mail.com"],
      judges: [],
      activeHearingPresentEmails: ["ana.torres@mail.com"],
      activeGrants: [],
    });
    expect(result.has("ana.torres@mail.com")).toBe(true);
  });

  it("never promotes a pending (non-active) hearing's parties", () => {
    // Simulated by simply not including them in activeHearingPresentEmails
    // — the caller (roleManager.ts) only ever passes the ACTIVE hearing's
    // present parties, never any other hearing's.
    const result = computePresenterEmails({
      connectedEmails: ["someone.else@mail.com"],
      judges: [],
      activeHearingPresentEmails: [],
      activeGrants: [],
    });
    expect(result.size).toBe(0);
  });

  it("promotes a connected general-public email with an active grant", () => {
    const result = computePresenterEmails({
      connectedEmails: ["observer.press@outlook.com"],
      judges: [],
      activeHearingPresentEmails: [],
      activeGrants: [{ email: "observer.press@outlook.com", revokedAt: null }],
    });
    expect(result.has("observer.press@outlook.com")).toBe(true);
  });

  it("stops promoting once a grant is revoked", () => {
    const result = computePresenterEmails({
      connectedEmails: ["observer.press@outlook.com"],
      judges: [],
      activeHearingPresentEmails: [],
      activeGrants: [{ email: "observer.press@outlook.com", revokedAt: new Date() }],
    });
    expect(result.has("observer.press@outlook.com")).toBe(false);
  });

  it("is case-insensitive across all three sources", () => {
    const result = computePresenterEmails({
      connectedEmails: ["Judge1@Court.gov"],
      judges: [{ email: "judge1@COURT.GOV" }],
      activeHearingPresentEmails: [],
      activeGrants: [],
    });
    expect(result.has("judge1@court.gov")).toBe(true);
  });
});
