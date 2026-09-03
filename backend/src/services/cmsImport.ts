import type { CmsHearingRow } from "./cmsClient";
import type { ImportJudge, ImportParty, ImportPayload } from "./importHearingData";

type RoleMapEntry =
  | { kind: "judge"; value: ImportJudge["role"] }
  | { kind: "party"; value: NonNullable<ImportParty["role"]> };

/**
 * Maps the CMS's free-text PersonRole to our JudgeRole/PartyRole enums —
 * SEEDED WITH REASONABLE GUESSES, not confirmed against the real CMS
 * vocabulary yet (docs/README.md, "Daily case-management import"). The
 * moment real CMS data shows a PersonRole string that isn't a key here,
 * add it — that's the whole point of keeping this as one flat, easy-to-
 * extend table rather than scattering role logic through the parser.
 */
export const CMS_ROLE_MAPPING: Record<string, RoleMapEntry> = {
  Judge: { kind: "judge", value: "JUDGE" },
  PresidingJudge: { kind: "judge", value: "PRESIDING_JUDGE" },
  "Presiding Judge": { kind: "judge", value: "PRESIDING_JUDGE" },
  Secretary: { kind: "judge", value: "SECRETARY" },
  Clerk: { kind: "judge", value: "OTHER_OFFICER" },
  Officer: { kind: "judge", value: "OTHER_OFFICER" },
  Party: { kind: "party", value: "PARTY" },
  Defendant: { kind: "party", value: "PARTY" },
  Plaintiff: { kind: "party", value: "PARTY" },
  Counsel: { kind: "party", value: "COUNSEL" },
  Lawyer: { kind: "party", value: "COUNSEL" },
  Attorney: { kind: "party", value: "COUNSEL" },
  Witness: { kind: "party", value: "WITNESS" },
};

// An unmapped role is treated as a party rather than dropped — silently
// losing a person from the feed is worse than misclassifying them as
// PARTY/OTHER, which is at least visible and correctable in the tab. It's
// never treated as a judge, since that would wrongly hand out presenter
// rights (services/presenterRules.ts) to someone we don't actually know
// the role of.
const UNMAPPED_ROLE_FALLBACK: RoleMapEntry = { kind: "party", value: "OTHER" };

function resolveRole(personRole: string): RoleMapEntry {
  const mapped = CMS_ROLE_MAPPING[personRole];
  if (!mapped) {
    console.warn(
      `[cms-import] unmapped PersonRole "${personRole}" — defaulting to party/OTHER. ` +
        `Add it to CMS_ROLE_MAPPING (backend/src/services/cmsImport.ts) once confirmed.`,
    );
    return UNMAPPED_ROLE_FALLBACK;
  }
  return mapped;
}

function emailsOf(row: CmsHearingRow): string[] {
  return Array.isArray(row.email) ? row.email : [row.email];
}

function normalizeSlashDate(d: string): string {
  const [m, day, y] = d.split("/");
  return `${y.padStart(4, "0")}-${m.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function parseDateTime(date: string, time: string): Date {
  const iso = date.includes("/") ? normalizeSlashDate(date) : date;
  return new Date(`${iso}T${time}:00`);
}

interface PersonAccum {
  name: string;
  role: RoleMapEntry;
  emails: Set<string>;
}

/**
 * Groups flat CMS rows into one ImportPayload per meeting, ready for
 * services/importHearingData.ts. A person is identified within a meeting
 * by (PersonUID, PersonRole) — the CMS's own "duplicity is role+UID
 * based" contract — so rows that only differ by Email (the flat/
 * one-row-per-email shape) collapse into a single person with every email
 * collected, exactly like the JSON-array-of-emails shape does in one row.
 *
 * Judges/auxiliaries are MEETING-scoped (matches JudgeOrAuxiliary in
 * prisma/schema.prisma): a person mapped to a judge role is added to that
 * meeting's judges list regardless of which HearingNumber row they showed
 * up under. Parties are HEARING-scoped, grouped per HearingNumber.
 */
export function parseCmsRows(rows: CmsHearingRow[]): Map<string, ImportPayload> {
  const meetings = new Map<
    string,
    {
      judges: Map<string, PersonAccum>;
      hearings: Map<number, { scheduledAt: Date; parties: Map<string, PersonAccum> }>;
    }
  >();

  for (const row of rows) {
    let meeting = meetings.get(row.meetingId);
    if (!meeting) {
      meeting = { judges: new Map(), hearings: new Map() };
      meetings.set(row.meetingId, meeting);
    }

    const resolved = resolveRole(row.personRole);
    const personKey = `${row.personUid}|${row.personRole}`;

    const targetMap =
      resolved.kind === "judge"
        ? meeting.judges
        : (() => {
            let hearing = meeting!.hearings.get(row.hearingNumber);
            if (!hearing) {
              hearing = { scheduledAt: parseDateTime(row.date, row.time), parties: new Map() };
              meeting!.hearings.set(row.hearingNumber, hearing);
            }
            return hearing.parties;
          })();

    const existing = targetMap.get(personKey);
    if (existing) {
      for (const e of emailsOf(row)) existing.emails.add(e);
    } else {
      targetMap.set(personKey, {
        name: row.personName,
        role: resolved,
        emails: new Set(emailsOf(row)),
      });
    }
  }

  const payloads = new Map<string, ImportPayload>();
  for (const [meetingId, m] of meetings) {
    payloads.set(meetingId, {
      judges: Array.from(m.judges.entries()).map(([key, p]) => ({
        externalUid: key.split("|")[0],
        name: p.name,
        role: p.role.value as ImportJudge["role"],
        emails: Array.from(p.emails),
      })),
      hearings: Array.from(m.hearings.entries()).map(([hearingNumber, h]) => ({
        hearingNumber,
        scheduledAt: h.scheduledAt,
        expectedParties: Array.from(h.parties.entries()).map(([key, p]) => ({
          externalUid: key.split("|")[0],
          name: p.name,
          role: p.role.value as ImportParty["role"],
          emails: Array.from(p.emails),
        })),
      })),
    });
  }
  return payloads;
}
