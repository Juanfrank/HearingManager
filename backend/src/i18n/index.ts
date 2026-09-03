import { es } from "./es";

/**
 * i18n for backend-generated, user-facing text (currently the session-
 * summary message — services/sessionSummary.ts). Only Spanish exists
 * today and it's the default (and only) locale, by product decision. To
 * add another locale: create `<code>.ts` alongside es.ts with the same
 * key set, register it in DICTIONARIES, and thread a per-meeting/per-
 * recipient locale into sendSessionSummaries() instead of the hardcoded
 * DEFAULT_LOCALE below — nothing else needs to change, every call site
 * already goes through t().
 */
export type Locale = "es";
export type TranslationKey = keyof typeof es;
type Dictionary = Record<TranslationKey, string>;

const DICTIONARIES: Record<Locale, Dictionary> = { es };
export const DEFAULT_LOCALE: Locale = "es";

export function t(key: TranslationKey, vars?: Record<string, string | number>): string {
  let str = DICTIONARIES[DEFAULT_LOCALE][key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${name}\\}`, "g"), String(value));
    }
  }
  return str;
}
