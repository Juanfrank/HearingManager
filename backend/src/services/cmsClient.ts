/**
 * Client for the court's case-management system's daily hearing feed —
 * the PULL counterpart to routes/provision.ts's PUSH endpoint (docs/
 * README.md "Daily case-management import"). Same GRAPH_MODE=mock pattern
 * used everywhere else in this codebase: until CMS_BASE_URL/CMS_API_KEY
 * point at a real system, CMS_MODE=mock returns a small built-in sample so
 * the whole pipeline (fetch -> parse -> upsert) is exercisable today.
 */

const CMS_MODE = process.env.CMS_MODE ?? "mock";
const CMS_BASE_URL = process.env.CMS_BASE_URL ?? "";
const CMS_API_KEY = process.env.CMS_API_KEY ?? "";

/**
 * One row of the feed. `email` may be a single string (the flat/CSV-like
 * shape, one row per email — duplicates across rows sharing the same
 * personUid+personRole are expected and collapsed by cmsImport.ts) or an
 * array (the JSON shape, no duplication needed) — see cmsImport.ts for
 * where that's handled; this module just fetches and returns rows as-is.
 */
export interface CmsHearingRow {
  meetingId: string;
  date: string; // "1900-01-01"
  time: string; // "09:00"
  hearingNumber: number;
  personUid: string;
  personRole: string;
  personName: string;
  email: string | string[];
}

function mockRowsForDate(date: string): CmsHearingRow[] {
  console.log(`[cms:mock] GET /hearings?date=${date}`);
  return [
    {
      meetingId: "cms-meeting-demo-1",
      date,
      time: "09:00",
      hearingNumber: 1,
      personUid: "10001",
      personRole: "Judge",
      personName: "Jorge Rodriguez",
      email: ["judge@judge.com", "alternative@judge.com"],
    },
    {
      meetingId: "cms-meeting-demo-1",
      date,
      time: "09:00",
      hearingNumber: 1,
      personUid: "20001",
      personRole: "Party",
      personName: "Ana Torres",
      email: ["ana.torres@mail.com"],
    },
    {
      meetingId: "cms-meeting-demo-1",
      date,
      time: "09:00",
      hearingNumber: 1,
      personUid: "20002",
      personRole: "Counsel",
      personName: "Luis Pena",
      email: ["luis.pena@mail.com"],
    },
  ];
}

/** GET {CMS_BASE_URL}/hearings?date=YYYY-MM-DD, Authorization: Bearer {CMS_API_KEY}. */
export async function fetchHearingsForDate(date: string): Promise<CmsHearingRow[]> {
  if (CMS_MODE === "mock") {
    return mockRowsForDate(date);
  }

  if (!CMS_BASE_URL || !CMS_API_KEY) {
    throw new Error("CMS_BASE_URL/CMS_API_KEY are not configured (CMS_MODE=real)");
  }

  const res = await fetch(`${CMS_BASE_URL}/hearings?date=${encodeURIComponent(date)}`, {
    headers: { Authorization: `Bearer ${CMS_API_KEY}` },
  });
  if (!res.ok) {
    throw new Error(`CMS fetch failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as CmsHearingRow[];
}
