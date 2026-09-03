import { es } from "./es";

/**
 * i18n entry point. Only Spanish exists today, and it's the default (and
 * only) locale — per product decision, not a placeholder. To add another
 * locale later:
 *   1. Create `<code>.ts` alongside es.ts with the exact same key set
 *      (copy es.ts, translate every value — TypeScript will flag any
 *      missing/extra key against the `Dictionary` type below).
 *   2. Register it in DICTIONARIES.
 *   3. Add a way to choose it (e.g. read Teams' locale from
 *      teamsContext.ts's app.getContext(), or a manual picker) and set
 *      `currentLocale` accordingly — nothing else in the app changes,
 *      every call site already goes through t().
 */
export type Locale = "es";
export type TranslationKey = keyof typeof es;
type Dictionary = Record<TranslationKey, string>;

const DICTIONARIES: Record<Locale, Dictionary> = { es };
export const DEFAULT_LOCALE: Locale = "es";

let currentLocale: Locale = DEFAULT_LOCALE;

export function getLocale(): Locale {
  return currentLocale;
}

/** Runtime check for whether `key` has a translation — see api error mapping in HearingCard.tsx. */
export function hasKey(key: string): key is TranslationKey {
  return Object.prototype.hasOwnProperty.call(DICTIONARIES[DEFAULT_LOCALE], key);
}

/**
 * Looks up `key` in the active locale's dictionary and fills in any
 * `{name}`-style placeholders from `vars`. Missing keys fall back to the
 * default locale, then to the raw key itself — the app should never throw
 * or render blank text over a translation gap.
 */
export function t(key: TranslationKey, vars?: Record<string, string | number>): string {
  const dict = DICTIONARIES[currentLocale] ?? DICTIONARIES[DEFAULT_LOCALE];
  let str = dict[key] ?? DICTIONARIES[DEFAULT_LOCALE][key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${name}\\}`, "g"), String(value));
    }
  }
  return str;
}
