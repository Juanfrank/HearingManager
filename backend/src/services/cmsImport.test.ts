import { describe, expect, it } from "vitest";
import { parseCmsRows } from "./cmsImport";
import type { CmsHearingRow } from "./cmsClient";

describe("parseCmsRows", () => {
  it("collapses duplicate flat rows for the same person into one entry with all emails", () => {
    const rows: CmsHearingRow[] = [
      {
        meetingId: "1",
        date: "1900-01-01",
        time: "09:00",
        hearingNumber: 1,
        personUid: "10001",
        personRole: "Judge",
        personName: "Jorge Rodriguez",
        email: "judge@judge.com",
      },
      {
        meetingId: "1",
        date: "1900-01-01",
        time: "09:00",
        hearingNumber: 1,
        personUid: "10001",
        personRole: "Judge",
        personName: "Jorge Rodriguez",
        email: "alternative@judge.com",
      },
    ];
    const result = parseCmsRows(rows);
    const payload = result.get("1")!;
    expect(payload.judges).toHaveLength(1);
    expect(payload.judges![0].emails.sort()).toEqual([
      "alternative@judge.com",
      "judge@judge.com",
    ]);
    expect(payload.judges![0].externalUid).toBe("10001");
  });

  it("accepts the JSON array-of-emails shape directly, no dedup needed", () => {
    const rows: CmsHearingRow[] = [
      {
        meetingId: "1",
        date: "1900-01-01",
        time: "09:00",
        hearingNumber: 1,
        personUid: "10001",
        personRole: "Judge",
        personName: "Jorge Rodriguez",
        email: ["judge@judge.com", "alternative@judge.com"],
      },
    ];
    const payload = parseCmsRows(rows).get("1")!;
    expect(payload.judges![0].emails.sort()).toEqual([
      "alternative@judge.com",
      "judge@judge.com",
    ]);
  });

  it("puts judges at meeting scope and parties at hearing scope", () => {
    const rows: CmsHearingRow[] = [
      {
        meetingId: "1",
        date: "1900-01-01",
        time: "09:00",
        hearingNumber: 1,
        personUid: "10001",
        personRole: "Judge",
        personName: "Jorge Rodriguez",
        email: "judge@judge.com",
      },
      {
        meetingId: "1",
        date: "1900-01-01",
        time: "09:00",
        hearingNumber: 1,
        personUid: "20001",
        personRole: "Party",
        personName: "Ana Torres",
        email: "ana.torres@mail.com",
      },
    ];
    const payload = parseCmsRows(rows).get("1")!;
    expect(payload.judges).toHaveLength(1);
    expect(payload.hearings).toHaveLength(1);
    expect(payload.hearings![0].expectedParties).toHaveLength(1);
    expect(payload.hearings![0].expectedParties![0].name).toBe("Ana Torres");
  });

  it("groups rows into separate payloads per MeetingID", () => {
    const rows: CmsHearingRow[] = [
      {
        meetingId: "A",
        date: "1900-01-01",
        time: "09:00",
        hearingNumber: 1,
        personUid: "1",
        personRole: "Judge",
        personName: "Judge A",
        email: "a@court.gov",
      },
      {
        meetingId: "B",
        date: "1900-01-01",
        time: "10:00",
        hearingNumber: 1,
        personUid: "2",
        personRole: "Judge",
        personName: "Judge B",
        email: "b@court.gov",
      },
    ];
    const result = parseCmsRows(rows);
    expect(result.size).toBe(2);
    expect(result.get("A")!.judges![0].name).toBe("Judge A");
    expect(result.get("B")!.judges![0].name).toBe("Judge B");
  });

  it("falls back an unmapped PersonRole to party/OTHER rather than dropping the row", () => {
    const rows: CmsHearingRow[] = [
      {
        meetingId: "1",
        date: "1900-01-01",
        time: "09:00",
        hearingNumber: 1,
        personUid: "99",
        personRole: "SomeUnknownRole",
        personName: "Mystery Person",
        email: "mystery@mail.com",
      },
    ];
    const payload = parseCmsRows(rows).get("1")!;
    expect(payload.judges).toHaveLength(0);
    expect(payload.hearings![0].expectedParties![0].role).toBe("OTHER");
  });
});
