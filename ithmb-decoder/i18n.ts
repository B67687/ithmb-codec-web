/**
 * i18n.ts — tiny zero-dependency localization loader for ITHMB Codec Web.
 *
 * Languages: en (default) + zh (Simplified Chinese).
 *
 * Language detection order: the server-rendered language wins (pages in the
 * /zh/ tree declare <html lang="zh-CN"> and are ALWAYS Chinese) →
 * localStorage("ithmbLang") → navigator.language (starts with "zh") → "en".
 * The locale owner (`locale.ts`) reads the document language and the stored
 * preference; this module only decides which one applies and fetches/re-applies
 * the string table. The old ?lang= query-param scheme was removed in Phase 3 —
 * the /zh/ pages are the canonical Chinese URLs now.
 *
 * Build note: the build bundles locale.ts into i18n.js so the deployed file
 * count is unchanged; the locale API is re-exported below for app/failure-info.
 * The route registry (routes.ts, a root build-time module) is re-exported the
 * same way so failure-info.ts can ask for page hrefs by key without adding a
 * public copy of the registry.
 *
 * Exports:
 *   t(key, params)          — lookup + {param} interpolation
 *   setLang(lang)           — switch language, persist, re-apply UI
 *   I18N                    — { lang, strings, loaded } state
 *   documentLocale / isLocale / readLocalePreference / setLocalePreference
 *                           — re-exported from locale.ts (single owner)
 *   pagePath(key, locale)   — re-exported from routes.ts (page registry)
 *
 * Static HTML attributes re-applied on init / setLang:
 *   data-i18n               — element text content (or <title> → document.title)
 *   data-i18n-html          — element innerHTML (trusted static strings with inline markup)
 *   data-i18n-placeholder   — placeholder attribute
 *   data-i18n-aria-label    — aria-label attribute
 *   data-i18n-title         — title attribute
 *
 * Classic (non-module) scripts such as nav.js can use the globals
 * window.I18N / window.t / window.setLang.
 *
 * Locale JSON is fetched from ./locales/{lang}.json on load. When the page
 * language is server-forced (always the case today), the served HTML stays
 * visible until the fetch lands and re-activates; the embedded English
 * defaults below only back the fallback path (no <html lang> declared, or
 * a failed fetch), so text never flashes untranslated.
 */

import {
  documentLocale,
  isLocale,
  readLocalePreference,
  setLocalePreference,
  type Locale,
} from "./locale.js";

export { documentLocale, isLocale, readLocalePreference, setLocalePreference } from "./locale.js";
// Page hrefs come from the one route registry (routes.ts). It is a build-time
// module: i18n.js is bundled, so the registry is inlined here rather than
// becoming a separate public file, mirroring the locale.ts arrangement.
export { pagePath } from "../src/routes.js";
export type { Locale, RouteKey } from "../src/routes.js";

// EMBEDDED_EN is the synchronous English fallback table. It is REGENERATED
// from locales/en.json by `npm run sync:i18n` (scripts/sync-embedded.mjs) and
// must never be hand-edited — scripts/check-i18n.mjs enforces exact parity.
// The `: Record<string, string>` annotation lets t() index it by arbitrary key.
// biome-ignore format: generated block (npm run sync:i18n) — must stay JSON.parse-able for scripts/check-i18n.mts.
const EMBEDDED_EN: Record<string, string> = {
  "nav.home": "Home",
  "nav.decoder": "Decoder",
  "nav.guide": "Guide",
  "nav.viewSource": "View source on GitHub",
  "nav.toggleLabel": "Switch language",
  "app.downloadAll": "Download all (.zip)",
  "app.zipTitle": "Download decoded files as {fmt} ZIP archive",
  "app.loadFailedMsg": "Check your connection and try again. If it keeps happening, your browser may not support the decoder.",
  "viewer.decodeFailed": "Couldn't decode",
  "viewer.decoding": "Decoding...",
  "card.decoded": "Decoded: {w} × {h}",
  "card.decodedFrame": "Decoded: {w} × {h} · frame {i} of {n}",
  "card.formatPrefix": "Format number:",
  "card.dimensions": "Dimensions:",
  "card.encoding": "Encoding:",
  "card.encodingJpeg": "JPEG (embedded)",
  "card.frame": "Frame:",
  "card.fileSize": "File size:",
  "card.save": "Save {fmt}",
  "card.unknownFormat": "Unknown format: prefix {prefix}",
  "card.error": "Error",
  "decoder.title": "Free .ITHMB File Viewer | ITHMB Codec",
  "decoder.dropAnywhere": "Drop .ithmb or .ipm file anywhere",
  "decoder.sampleFailed": "Couldn't load the sample file. Try dropping a file instead.",
  "decoder.unknownFormat": "Unknown format. This file isn't a .ithmb variant the decoder recognizes.",
  "nav.themeToggle": "Toggle theme",
  "decoder.description": "Open Apple .ithmb and .ipm thumbnail files from old iPods and iPhones in your browser. Save the image as JPEG, PNG, BMP or WebP. Free, private and open source.",
  "decoder.encodingOne": "1 encoding",
  "decoder.encodings": "{m} encodings",
  "decoder.imageOne": "1 image",
  "decoder.images": "{n} images",
  "decoder.containerOne": "1 file",
  "decoder.containers": "{m} files",
  "app.zipFormat": "ZIP format",
  "app.zipFormatAria": "ZIP download format",
  "viewer.regionLabel": "Decoded image viewer",
  "viewer.imageLabel": "Decoded image {i} of {n}: {name}, {w} × {h}",
  "viewer.cardImageLabel": "Decoded image: {name}, {w} × {h}",
  "decoder.liveDecoding": "Decoding {n} file(s)…",
  "decoder.liveDone": "Decoded {n} image(s).",
  "decoder.liveDoneMixed": "Decoded {n} image(s). {f} file(s) could not be decoded.",
  "card.saveAs": "Save as",
  "card.fileEmpty": "Empty file. Nothing to decode.",
  "card.fileDamaged": "Couldn't decode this file. It looks damaged.",
  "app.clearConfirm": "This reloads the decoder and you will need to drop the files again.",
  "app.clearTitle": "Clear the decoded files?",
  "app.clearAction": "Clear files",
  "a11y.opensNewTab": "(opens in a new tab)",
  "ui.cancel": "Cancel",
  "failure.damagedTitle": "Couldn't decode",
  "failure.unknownTitle": "Unknown format",
  "failure.meta": "Format number: {prefix} · {size}",
  "failure.whyDamaged": "The file is empty, cut short, or its data is corrupted.",
  "failure.whyUnknown": "This file isn't an .ithmb variant the browser decoder recognizes.",
  "failure.whyEmpty": "A 0-byte file has no header or image data.",
  "failure.reportIssue": "Open an issue on GitHub",
  "failure.nextGuide": "Read the guide",
  "failure.nextPrivacy": "Privacy",
  "failure.nextTry": "Try another file",
  "app.downloadDecoding": "Decoding {done}/{total}…",
  "app.downloadDecodingTitle": "Available after every file finishes decoding",
  "app.zipCancel": "Cancel ZIP ({done}/{total})",
  "app.zipCancelTitle": "Click again to cancel this ZIP build",
  "app.zipCancelled": "ZIP build canceled.",
  "app.zipLargeTitle": "Large archive",
  "app.zipLargeMsg": "This ZIP will contain {n} images (about {mb} MB of source files). Continue?",
  "app.zipLargeConfirm": "Build ZIP",
  "app.encodeFailed": "Couldn't encode that image. Try another format.",
  "viewer.showing": "Showing {i} of {n}",
  "viewer.openHint": "open in the viewer",
  "ui.dismiss": "Dismiss",
  "ui.summaryAccepted": "{n} accepted",
  "ui.summaryUnsupported": "{n} not .ithmb/.ipm",
  "ui.summaryTooLarge": "{n} over {mb} MB",
  "ui.summaryDuplicates": "{n} duplicate",
  "ui.summaryFileCap": "{n} over the {max}-file session limit",
  "ui.summaryByteCap": "{n} over the {mb} MB session limit",
  "ui.summaryFolders": "{n} folder: drop the files inside",
  "ui.summaryLive": "Batch summary: {text}",
  "card.database": "Apple database file",
  "failure.databaseTitle": "Apple database file",
  "failure.whyDatabase": "This is a PhotoDB/ArtworkDB database (mhfd/mhbd), not a single image. The browser decoder only reads image containers. Use the desktop Ithmb-Codec tool for database files.",
  "viewer.cardRole": "image result",
  "app.help": "Limits: {fileMb} MB per file, {sessionFiles} files and {sessionMb} MB per session. A ZIP over {zipMb} MB asks for confirmation. Shortcuts: ← → arrows navigate, hold to repeat.",
  "decoder.resultsWindowHint": "Showing {n} images. Scroll inside the results to see them all.",
  "decoder.resultsAll": "All {n} images are on the page."
};

export const I18N: {
  lang: string;
  strings: Record<string, string>;
  loaded: boolean;
} = {
  lang: "en",
  /** Current active string table (embedded English defaults until a fetch lands). */
  strings: EMBEDDED_EN,
  /** True once the fetched locale JSON has been merged in. */
  loaded: false,
};

// Dynamic UI that renders late (the decoder failure panel is the one that
// matters) must not call t() while a forced-language page still shows the
// embedded English defaults. `whenLocaleReady()` resolves once the served
// locale has either landed or definitively failed; callers that need sentinel
// handling can check I18N.loaded afterwards.
let resolveLocaleReady: (() => void) | null = null;
const localeReady = new Promise<void>((resolve) => {
  resolveLocaleReady = resolve;
});
function settleLocaleReady(): void {
  const resolve = resolveLocaleReady;
  resolveLocaleReady = null;
  resolve?.();
}
export function whenLocaleReady(): Promise<void> {
  return I18N.loaded ? Promise.resolve() : localeReady;
}

// The server-rendered language wins. Every page declares <html lang="en"> or
// <html lang="zh-CN">; its served HTML IS the canonical content for that
// language, so it must never be swapped by client detection (localStorage
// or navigator.language) — the URL is the source of truth, and the
// language switcher is a plain link between locales.
function detectLang(): Locale {
  const forced = documentLocale();
  if (forced) return forced;
  const stored = readLocalePreference();
  if (stored) return stored;
  const nav = (navigator.language || "").toLowerCase();
  if (nav.startsWith("zh")) return "zh";
  return "en";
}

/**
 * Translate a key. Optional {param} interpolation, e.g.
 * t("card.save", { fmt: "JPEG" }). Falls back to embedded English, then the
 * key itself, so a missing translation never renders blank.
 */
// Escape interpolated param values. Params can land in data-i18n-html
// (innerHTML) sinks, so escaping them prevents a future caller from turning
// a user-controlled param into markup (CWE-79). All current callers pass
// numbers or fixed map values, so this is a no-op today.
function escapeParam(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function t(key: string, params?: Record<string, string | number>): string {
  let str =
    (I18N.strings && I18N.strings[key] !== undefined ? I18N.strings[key] : undefined) ??
    (EMBEDDED_EN[key] !== undefined ? EMBEDDED_EN[key] : undefined) ??
    key;
  if (params) {
    for (const k of Object.keys(params)) {
      str = str.split("{" + k + "}").join(escapeParam(String(params[k])));
    }
  }
  return str;
}

function applyToElement(el: HTMLElement): void {
  const key = el.dataset.i18n;
  if (key) {
    if (el.tagName === "TITLE") document.title = t(key);
    else el.textContent = t(key);
  }
  const htmlKey = el.dataset.i18nHtml;
  if (htmlKey) {
    if (el.tagName === "TITLE") document.title = t(htmlKey);
    else el.innerHTML = t(htmlKey);
  }
  if (el.dataset.i18nPlaceholder !== undefined)
    (el as HTMLInputElement | HTMLTextAreaElement).placeholder = t(el.dataset.i18nPlaceholder);
  if (el.dataset.i18nAriaLabel !== undefined)
    el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel));
  if (el.dataset.i18nTitle !== undefined) el.setAttribute("title", t(el.dataset.i18nTitle));
  // meta[name=description] and similar content-attribute tags.
  if (el.dataset.i18nContent !== undefined) el.setAttribute("content", t(el.dataset.i18nContent));
}

function applyTranslations(): void {
  // Keep the regional tag so the document stays zh-CN (valid <html lang>
  // value and keeps html[lang="zh-CN"] / region-sensitive CSS in play).
  document.documentElement.lang = I18N.lang === "zh" ? "zh-CN" : "en";
  const sel =
    "[data-i18n], [data-i18n-html], [data-i18n-placeholder], [data-i18n-aria-label], [data-i18n-title], [data-i18n-content]";
  document.querySelectorAll(sel).forEach((el) => applyToElement(el as HTMLElement));
  // The EN/中 toggle's active option needs no JS: the stylesheet selects it
  // from the document language (html[lang] / :lang) that line 1 just set.
}

/**
 * B6: the active locale is the only one fetched on load. The old preload of
 * every supported locale fetched the active file twice (loadLocale + preload)
 * and pulled the other locale — both extra requests on the decoder's critical
 * path. A language switch is now a plain navigation between /en and /zh URLs,
 * so the secondary table is fetched only if setLang() is actually called.
 */

// Shared tail for every path that changes the active string table: swap in
// the merged translations, mark loaded, re-apply to the DOM, and notify
// subscribers (app.js re-renders cards). i18n.ts imports no UI modules — the
// CustomEvent is the decoupling point; locale.ts (its only import) is pure
// detection/storage with no UI.
function activateLanguage(merged: Record<string, string>): void {
  I18N.strings = merged;
  I18N.loaded = true;
  applyTranslations();
  settleLocaleReady();
  window.dispatchEvent(new CustomEvent("languagechange"));
}

/**
 * Switch the active language. Persists to localStorage and re-applies all
 * data-i18n text immediately (embedded defaults), then refreshes from the
 * locale JSON in the background.
 */
export function setLang(lang: string): void {
  if (!isLocale(lang)) return;
  I18N.lang = lang;
  // The locale owner is the only writer of ithmbLang (and it only rewrites a
  // value that actually changed); the language switcher sets the preference
  // through the same owner when it navigates between locales.
  setLocalePreference(lang);
  activateOrFetch(lang);
}

// Shared: fetch the target language, keep embedded defaults until it lands.
function activateOrFetch(lang: string): void {
  loadLocale(lang);
  activateLanguage(Object.assign({}, EMBEDDED_EN));
}

async function loadLocale(lang: string): Promise<void> {
  try {
    // Resolve locales relative to THIS module's URL, not the page URL — the
    // module is served from /ithmb-decoder/ and may be injected into root
    // pages (via nav.js), where a bare "locales/..." path would 404.
    const base = new URL(".", import.meta.url).href;
    const resp = await fetch(base + "locales/" + lang + ".json", {
      cache: "no-cache",
    });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const data = (await resp.json()) as Record<string, string>;
    if (I18N.lang !== lang) return; // a newer setLang() superseded this fetch
    // Locale JSON landed AFTER setLang's early dispatch — activate so
    // subscribers (app.js reRenderCards) rebuild with real translations,
    // not the embedded English defaults.
    activateLanguage(Object.assign({}, EMBEDDED_EN, data));
  } catch (e) {
    // Embedded defaults already cover the UI — nothing to recover. Release
    // waiters so a late failure panel can fall back instead of hanging.
    settleLocaleReady();
  }
}

// Initialise: the server-rendered language (<html lang>) is authoritative
// on every page. When it is forced, adopt it WITHOUT applying the embedded
// English fallback over the served HTML — the page is already fully
// translated and must not flash English while the locale JSON loads;
// loadLocale() re-activates with the merged table when the fetch lands.
// Only when no language is forced (no <html lang> declared) do we fall
// back to detectLang(): stored preference → browser language → en,
// rendered synchronously from embedded defaults (nothing flashes blank).
const forced = documentLocale();
if (forced) {
  I18N.lang = forced;
  loadLocale(forced);
} else {
  setLang(detectLang());
}

// Expose globals for classic scripts (nav.js, footer.js, etc.).
window.I18N = I18N;
window.t = t;
window.setLang = setLang;
