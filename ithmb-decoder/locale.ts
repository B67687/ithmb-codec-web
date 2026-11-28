/**
 * locale.ts — single owner of the site's language identity.
 *
 * Three inputs describe "which language" and this module is the only place
 * that defines how each one is read and which one wins:
 *   * the URL pathname (`/zh/...` is Chinese) — a direct URL always wins;
 *   * the server-rendered `<html lang>` — authoritative on a rendered page;
 *   * the stored `ithmbLang` preference — only a fallback for the next visit
 *     when a page declares no language.
 *
 * `setLocalePreference()` is the only writer of `ithmbLang`, so the
 * write-only-when-changed guard and the storage-blocked fallback exist once.
 *
 * Build note: this module is compiled into `i18n.js` (see scripts/build.mts)
 * instead of being emitted as its own ESM file, so the deployed file count is
 * unchanged; `i18n.ts` re-exports its API for the rest of the module graph.
 * The classic root scripts (nav/footer/decoder-boot/decoder-watchdog/
 * 404-lang) import it directly and the build bundles it into each of them.
 */

export type Locale = "en" | "zh";

/** localStorage key shared by every writer/reader of the preference. */
const STORAGE_KEY = "ithmbLang";

/** Narrow an arbitrary stored/detected string to a supported locale. */
export function isLocale(value: string | null | undefined): value is Locale {
  return value === "en" || value === "zh";
}

/** Locale encoded by a URL pathname: `/zh` and `/zh/...` are Chinese. */
export function pathnameLocale(pathname: string): Locale {
  return pathname.indexOf("/zh/") === 0 || pathname === "/zh" ? "zh" : "en";
}

/** Locale declared by the current document (`<html lang>`), if any. */
export function documentLocale(): Locale | null {
  if (typeof document === "undefined") return null;
  const lang = (document.documentElement.getAttribute("lang") || "").toLowerCase();
  if (lang.indexOf("zh") === 0) return "zh";
  if (lang.indexOf("en") === 0) return "en";
  return null;
}

/** Stored language preference, or null when unset/unreadable/unsupported. */
export function readLocalePreference(): Locale | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return isLocale(saved) ? saved : null;
  } catch {
    // Storage blocked (private mode / sandboxed iframe): no preference.
    return null;
  }
}

/**
 * The only writer of `ithmbLang`. Persisting the choice is best effort: with
 * storage blocked the switch still navigates to the explicit locale URL.
 */
export function setLocalePreference(locale: Locale): void {
  try {
    if (localStorage.getItem(STORAGE_KEY) !== locale) {
      localStorage.setItem(STORAGE_KEY, locale);
    }
  } catch {
    // Storage blocked — the URL already encodes the chosen locale.
  }
}
