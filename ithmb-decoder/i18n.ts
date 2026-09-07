/**
 * i18n.ts — tiny zero-dependency localization loader for ITHMB Codec Web.
 *
 * Languages: en (default) + zh (Simplified Chinese).
 *
 * Language detection order: server-rendered language wins (pages in the
 * /zh/ tree declare <html lang="zh-CN"> and are ALWAYS Chinese) →
 * localStorage("ithmbLang") → navigator.language (starts with "zh") → "en".
 * The old ?lang= query-param scheme was removed in Phase 3 — the /zh/
 * pages are the canonical Chinese URLs now.
 *
 * Exports:
 *   t(key, params)          — lookup + {param} interpolation
 *   setLang(lang)           — switch language, persist, re-apply UI
 *   I18N                    — { lang, strings, loaded } state
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

// EMBEDDED_EN is the synchronous English fallback table. It is REGENERATED
// from locales/en.json by `npm run sync:i18n` (scripts/sync-embedded.mjs) and
// must never be hand-edited — scripts/check-i18n.mjs enforces exact parity.
// The `: Record<string, string>` annotation lets t() index it by arbitrary key.
const EMBEDDED_EN: Record<string, string> = {
  "nav.home": "Home",
  "nav.decoder": "Decoder",
  "nav.guide": "Guide",
  "nav.buyMeCoffee": "Buy me a coffee",
  "nav.viewSource": "View source on GitHub",
  "nav.toggleLabel": "Switch language",
  "app.shortcuts": "Shortcuts: ← → arrows navigate · Esc closes viewer · G toggles grid · Hold arrows for repeat",
  "app.gridView": "Grid view",
  "app.gallery": "Gallery",
  "app.downloadAll": "Download All",
  "app.zipTitle": "Download decoded files as {fmt} ZIP archive",
  "app.loadFailedTitle": "Failed to load decoder.",
  "app.loadFailedMsg": "Make sure your browser supports WebAssembly.",
  "app.retry": "Retry",
  "app.retrying": "Retrying…",
  "viewer.decodeFailed": "Decode Failed",
  "viewer.decoding": "Decoding...",
  "viewer.unknown": "Unknown",
  "viewer.zipTitle": "Download {count} files as a ZIP archive",
  "card.decoded": "Decoded — {w}×{h}",
  "card.formatPrefix": "Format prefix:",
  "card.dimensions": "Dimensions:",
  "card.encoding": "Encoding:",
  "card.fileSize": "File size:",
  "card.save": "Save {fmt}",
  "card.formatAria": "Output format",
  "card.decodeFailed": "Decode failed — corrupt or unsupported variant",
  "card.unknownFormat": "Unknown format — prefix {prefix}",
  "card.error": "Error",
  "share.helpImprove": "Help improve the decoder",
  "share.knownText": "This format is known but the decoder couldn't process it. Sharing its first 16 bytes helps fix support.",
  "share.unknownText": "This format isn't recognized yet. Sharing its first 16 bytes helps add support.",
  "share.share16": "Share 16 bytes",
  "share.shareFull": "Share full file",
  "share.fullSharedTitle": "Full file already shared — the 16 bytes are included",
  "share.fullSharedToast": "Full file shared — thank you!",
  "share.headerSharedToast": "16 bytes shared — thank you!",
  "share.failedToast": "Share failed — the server rejected this file",
  "share.imageLooksWrong": "Image looks wrong? Share the first 16 bytes",
  "share.thanksShared": "Thanks — shared ✓",
  "share.shared": "Shared ✓",
  "share.issueColorSpace": "Colors look wrong (too blue / red / green)",
  "share.issueDimensions": "Stretched or wrong shape",
  "share.issueStride": "Horizontal lines or bands",
  "share.issueOffset": "Shifted / cut off at the edges",
  "share.issueByteOrder": "Noisy / scrambled / pixelated",
  "share.issueOther": "Something else",
  "share.whatLooksWrong": "What looks wrong? (optional)",
  "share.submit": "Submit",
  "share.cancel": "Cancel",
  "share.selectIssue": "Please select what looks wrong",
  "share.reportSharedToast": "Report shared — thank you!",
  "ui.skipped": "{n} file(s) skipped — only .ithmb and .ipm accepted",
  "ui.tooLarge": "{n} file(s) skipped — max 8MB",
  "decoder.title": "Free .ITHMB File Viewer & Converter | ITHMB Codec",
  "decoder.subtitle1": "Free, Local, No tracking",
  "decoder.subtitle2": " file decoder —",
  "decoder.openSource": "open source",
  "decoder.dropAnywhere": "Drop .ithmb or .ipm file anywhere",
  "decoder.dropzoneLabel": "Drop .ithmb or .ipm files here",
  "decoder.dropzoneHint": "or click to browse — all processing happens in your browser",
  "decoder.keyboardShortcuts": "Keyboard shortcuts",
  "decoder.toggleGrid": "Toggle grid (Esc)",
  "decoder.previous": "Previous (←)",
  "decoder.next": "Next (→)",
  "decoder.prevImage": "Previous image",
  "decoder.nextImage": "Next image",
  "decoder.backToTop": "Back to top",
  "decoder.backToPosition": "Back to position {n}",
  "decoder.decodeFailed": "Decode failed — file may be corrupt or truncated",
  "decoder.unknownFormat": "Unknown format — this file is not a recognized .ithmb variant",
  "decoder.h1": "Free .ITHMB File Viewer & Converter",
  "decoder.convertH2": "Convert ITHMB to JPG or PNG",
  "decoder.convertP1": "Drop your .ithmb files onto this page and every thumbnail in the container is decoded and displayed instantly. Pick JPG, PNG, BMP, or WebP when you download each image, or save the whole batch as a ZIP archive.",
  "decoder.convertP2": "The conversion runs locally in your browser via WebAssembly — nothing is uploaded, nothing to install, no account needed.",
  "decoder.platformH2": "Works on Windows, macOS, and Linux",
  "decoder.platformP1": "The decoder runs in any modern browser (Chrome, Firefox, Safari, Edge), so it works the same on Windows, macOS, Linux, and mobile — no installation required. Windows desktop users can also open .ithmb files directly in ImageGlass with the project's native <a href=\"https://github.com/B67687/ImageGlass-Ithmb-Plugin\">ImageGlass plugin</a>.",
  "decoder.originH2": "What Are ITHMB Files?",
  "decoder.originP1": "ITHMB (iThumbnail) is the thumbnail cache format Apple's classic iPods used for photo previews. Each file bundles thumbnail-sized album art, photos, and menu graphics that the iPod's UI read directly from its disk, so the device could browse a photo library without loading full-size originals.",
  "decoder.originP2": "The format was never publicly documented and varies across devices and firmware versions, which is why regular image viewers can't open it. These files most often turn up in PhotoData folders copied from old iPods during data recovery or backups.",
  "home.subtitle": "Decode Apple thumbnail files (.ithmb, .ipm) — free, local, no tracking",
  "home.free": "Free",
  "home.popular": "Popular",
  "home.decoderCardTitle": "ITHMB Decoder",
  "home.decoderDesc": "Free online decoder. Drop .ithmb or .ipm files and get JPEG images instantly. All processing happens in your browser.",
  "home.guide": "Guide",
  "home.guideCardTitle": "About ITHMB Files",
  "home.guideDesc": "Learn what .ithmb files are, how to decode them, and why this tool exists.",
  "home.enterprise": "Enterprise",
  "home.enterpriseCardTitle": "Enterprise Licensing",
  "home.enterpriseDesc": "Custom integration and licensing for organizations.",
  "enterprise.title": "Enterprise | ITHMB Codec",
  "enterprise.h1": "ITHMB Codec Enterprise",
  "enterprise.text1": "Enterprise licensing, custom integration, and dedicated support are under consideration. If your organization needs these, reach out via",
  "enterprise.github": "GitHub",
  "enterprise.back": "← Back to ITHMB Codec",
  "notfound.title": "Page Not Found | ITHMB Codec",
  "notfound.msg": "This page flew away. The file you're looking for doesn't exist or has moved.",
  "notfound.back": "Back to Home",
  "guide.title": "How to Open .ITHMB Files on Windows & Mac (2026) | ITHMB Codec",
  "guide.subtitle": "Guides & documentation for the Apple thumbnail decoder",
  "guide.h1": "How to Open .ITHMB Files",
  "guide.lead": "ITHMB (short for iThumbnail — Apple's thumbnail image format) is a binary container format used by Apple's iOS and macOS to store thumbnail caches. You'll find these files scattered inside PhotoData folders on old iPods, iPhones, and Macs when recovering data, migrating devices, or digging through backups. They don't open with a regular image viewer. This guide shows you how to decode them.",
  "guide.whatIs.h2": "What Is an ITHMB File?",
  "guide.whatIs.p1": "Apple created the ITHMB format to batch-store small thumbnail images in a single file. Apps like Photos, Preview, and Finder use it to serve up thumbnail previews without loading the full-resolution originals. The format packs multiple JPEG images together with a binary index, which is why double-clicking an .ithmb file does nothing useful on its own.",
  "guide.whatIs.p2": "ITHMB files are most commonly encountered when extracting data from older Apple devices (iPhone 3G through iPhone 5-era, early iPod Touch models, and Macs running macOS 10.4 through 10.14). If you've ever copied a “PhotoData” folder from an iPod or iPhone backup, you've probably seen them. The closely related <strong>.ipm</strong> format works the same way for iPod Photo caches.",
  "guide.howTo.h2": "How to Use the Free Online Decoder",
  "guide.howTo.p": "The fastest way to <strong>open ithmb online</strong> is the <a href=\"https://ithmb-codec.dev/ithmb-decoder/\">free ITHMB to JPEG converter</a> built by the Ithmb-Codec project. It runs entirely in your browser — no installation, no account, and it works on Windows, macOS, Linux, and even your phone. Here's how:",
  "guide.howTo.step1": "<strong>Go to the decoder.</strong> Open <a href=\"https://ithmb-codec.dev/ithmb-decoder/\">ithmb-codec.dev/ithmb-decoder</a> in any modern browser (Chrome, Firefox, Safari, Edge).",
  "guide.howTo.step2": "<strong>Drag and drop your .ithmb files.</strong> You can drag one file or many at once. The decoder also accepts .ipm files.",
  "guide.howTo.step3": "<strong>View and download as JPEG.</strong> Each thumbnail in the container is extracted and displayed. Download individual images or grab them all at once as a ZIP archive.",
  "guide.afterSteps.p": "That's it. No account, no upload button, no waiting. The decoder is the most straightforward <strong>online ITHMB viewer</strong> available.",
  "guide.why.h2": "Why Use This Decoder?",
  "guide.why.private": "<strong>Private.</strong> No data leaves your computer by default. The decoder runs via WebAssembly with zero automatic uploads. Your thumbnail files never touch a network unless you click a one-click “Share” button to contribute anonymous format signatures.",
  "guide.why.fast": "<strong>Fast.</strong> The WebAssembly core processes files locally at near-native speed. Even large .ithmb containers decode in seconds.",
  "guide.why.free": "<strong>Free.</strong> No paywalls, no limits on file size or batch count. It always works at zero cost.",
  "guide.why.openSource": "<strong>Open source.</strong> Every line of code is public on GitHub. No hidden tracking, no analytics, no data collection.",
  "guide.why.batch": "<strong>Batch support.</strong> Drop multiple .ithmb files at once and download them all as a single ZIP.",
  "guide.why.cta": "If you're looking to <strong>convert ithmb to jpg</strong> in bulk or just need to <strong>extract iPod photos</strong> from an old backup, this is the simplest tool for the job.",
  "guide.about.h2": "About the ITHMB Codec Project",
  "guide.about.p1": "Ithmb-Codec is an open-source reverse-engineering effort to document and decode Apple's proprietary thumbnail container formats. The project maintains the reference decoder library (written in Rust, compiled to WebAssembly), the browser-based decoder linked above, and format documentation for researchers and digital archivists.",
  "guide.about.p2": "Bug reports and format samples are always welcome — open an issue on <a href=\"https://github.com/B67687/Ithmb-Codec\">GitHub</a> and we'll investigate. If you find this useful, give us a ⭐ on GitHub.",
  "guide.faq.h2": "Frequently Asked Questions",
  "guide.faq.q1": "Can I convert multiple .ithmb files at once?",
  "guide.faq.a1": "Yes. Drag multiple files into the decoder and it processes them all. After decoding, click the download button to save every extracted image as a ZIP archive.",
  "guide.faq.q2": "Are my files uploaded to a server?",
  "guide.faq.a2": "No. The decoder runs entirely in your browser using WebAssembly. Your files are never sent over the network. All processing stays local, which makes this a fully private <strong>free ITHMB converter</strong>.",
  "guide.faq.q3": "What about .ipm files?",
  "guide.faq.a3": "They're supported too. The decoder handles both .ithmb and .ipm formats, since they share the same underlying container structure used by Apple's iPod Photo cache system.",
  "guide.faq.q4": "Is this tool free?",
  "guide.faq.a4": "Always. The tool is and will remain free, open source, and free of usage limits. If you'd like to support development, you can <a href=\"https://buymeacoffee.com/ThumbNami\">buy the author a coffee</a>",
  "guide.mockup.ariaDecoder": "The decoder in action: a UYVY test image displayed in the viewer",
  "guide.mockup.gridView": "Grid view",
  "guide.mockup.downloadAll": "Download All",
  "guide.mockup.saveJpeg": "Save JPEG",
  "guide.mockup.ariaBatch": "Batch of decoded test images in grid view, ready to download",
  "guide.mockup.status720": "Decoded — 720×480",
  "guide.mockup.status320": "Decoded — 320×320",
  "guide.mockup.fmtPrefix1019": "Format prefix: <span class=\"prefix-badge\">1019</span>",
  "guide.mockup.fmtPrefix1067": "Format prefix: <span class=\"prefix-badge\">1067</span>",
  "guide.mockup.fmtPrefix3005": "Format prefix: <span class=\"prefix-badge\">3005</span>",
  "guide.mockup.dims720": "Dimensions: 720×480 px",
  "guide.mockup.dims320": "Dimensions: 320×320 px",
  "guide.mockup.encUyvy": "Encoding: UYVY 4:2:2",
  "guide.mockup.encYcbcr": "Encoding: YCbCr 4:2:0",
  "guide.mockup.encRgb555": "Encoding: RGB555",
  "guide.mockup.size675": "File size: 675.0 KB",
  "guide.mockup.size506": "File size: 506.3 KB",
  "guide.mockup.size200": "File size: 200.0 KB",
  "footer.poweredBy": "Powered by",
  "footer.poweredBySuffix": "",
  "footer.buyCoffee": "Buy me a coffee",
  "footer.privacy": "Privacy",
  "nav.themeToggle": "Toggle theme",
  "home.description": "Free online ITHMB and IPM thumbnail decoder. Convert Apple iPod/iPhone .ithmb files to JPEG instantly in your browser. Private — files stay on your device unless you opt in to share.",
  "home.ogTitle": "ITHMB Codec — free, private, browser-based .ithmb decoder",
  "home.ogDescription": "Decode Apple Icons + Thumbnails binary format (.ithmb, .ipm) directly in your browser. Private by default, no automatic uploads.",
  "decoder.description": "Decode and convert Apple iPod/iPhone .ithmb and .ipm thumbnail files to JPG, PNG, or WebP directly in your browser. Free, private, open source. No uploads required.",
  "guide.description": "Free online tool to open and convert Apple iPod/iPhone .ithmb thumbnail files to JPEG. Private by default — nothing is uploaded unless you opt in to share.",
  "enterprise.description": "Enterprise licensing, custom integration, and dedicated support for the open-source ITHMB Codec Apple thumbnail decoder.",
  "notfound.description": "Page not found on ITHMB Codec — the Apple thumbnail decoder."
};

const SUPPORTED: Record<string, boolean> = { en: true, zh: true };
const STORAGE_KEY = "ithmbLang";

export const I18N: {
  lang: string;
  strings: Record<string, string>;
  loaded: boolean;
  _locales?: Record<string, Record<string, string>>;
} = {
  lang: "en",
  /** Current active string table (embedded English defaults until a fetch lands). */
  strings: EMBEDDED_EN,
  /** True once the fetched locale JSON has been merged in. */
  loaded: false,
};

// The server-rendered language wins. Every page declares <html lang="en"> or
// <html lang="zh-CN">; its served HTML IS the canonical content for that
// language, so it must never be swapped by client detection (localStorage
// or navigator.language) — the URL is the source of truth, and the
// language switcher is a plain link between locales.
function forcedLang(): string | null {
  const lang = (document.documentElement.getAttribute("lang") || "").toLowerCase();
  if (lang.indexOf("zh") === 0) return "zh";
  if (lang.indexOf("en") === 0) return "en";
  return null;
}

function detectLang(): string {
  const forced = forcedLang();
  if (forced) return forced;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED[saved]) return saved;
  } catch (e) {
    // Storage may be blocked (private mode / sandboxed iframe) — fall through.
  }
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
  if (el.dataset.i18nContent !== undefined)
    el.setAttribute("content", t(el.dataset.i18nContent));
}

// Highlight the active option in the nav EN/中 toggle.
function updateLangToggle(): void {
  const btn = document.getElementById("langToggle");
  if (!btn) return;
  btn.querySelectorAll<HTMLElement>(".lang-opt").forEach((opt) => {
    const active = opt.dataset.lang === I18N.lang;
    opt.style.color = active
      ? "var(--accent, #007aff)"
      : "var(--muted, #86868b)";
    opt.style.fontWeight = active ? "700" : "500";
  });
}

function applyTranslations(): void {
  document.documentElement.lang = I18N.lang;
  const sel =
    "[data-i18n], [data-i18n-html], [data-i18n-placeholder], [data-i18n-aria-label], [data-i18n-title], [data-i18n-content]";
  document.querySelectorAll(sel).forEach((el) => applyToElement(el as HTMLElement));
  updateLangToggle();
}

/**
 * Preload every supported locale into I18N.strings at init, so a later
 * setLang() is a pure in-memory swap with NO fetch in the critical path.
 * The locales are tiny (~5KB each); this makes the first language switch
 * instant instead of: render English -> fetch JSON -> re-render.
 */
async function preloadLocales(): Promise<void> {
  const base = new URL(".", import.meta.url).href;
  const loaded: Record<string, Record<string, string>> = {};
  for (const lang of Object.keys(SUPPORTED)) {
    try {
      const resp = await fetch(base + "locales/" + lang + ".json", { cache: "no-cache" });
      // fetch's json() is `Promise<any>` (DOM spec) — pinned to the locale
      // table shape at this one boundary.
      if (resp.ok) loaded[lang] = (await resp.json()) as Record<string, string>;
    } catch (e) {
      // Keep embedded defaults for this lang; not fatal.
    }
  }
  // Store the preloaded tables for instant future switches. Do NOT activate
  // here: activation belongs to the setLang/loadLocale path, and a stale
  // activation from preload could clobber fresher translations (e.g. if the
  // current language's preload fetch failed while loadLocale succeeded).
  I18N._locales = loaded;
}

// Shared tail for every path that changes the active string table: swap in
// the merged translations, mark loaded, re-apply to the DOM, and notify
// subscribers (app.js re-renders cards). i18n.ts stays dependency-free — the
// CustomEvent is the decoupling point, no UI imports.
function activateLanguage(merged: Record<string, string>): void {
  I18N.strings = merged;
  I18N.loaded = true;
  applyTranslations();
  window.dispatchEvent(new CustomEvent("languagechange"));
}

/**
* Switch the active language. Persists to localStorage and re-applies all
* data-i18n text immediately (embedded defaults), then refreshes from the
* locale JSON in the background.
*/
export function setLang(lang: string): void {
  if (!SUPPORTED[lang]) return;
  I18N.lang = lang;
  // Only persist when the stored value actually changes. This is the only
  // writer of STORAGE_KEY in i18n.ts; the language switcher sets the
  // preference directly when it navigates between locales.
  try {
    if (localStorage.getItem(STORAGE_KEY) !== lang) {
      localStorage.setItem(STORAGE_KEY, lang);
    }
  } catch (e) {
    // Ignore persistence failures.
  }
  activateOrFetch(lang);
}

// Shared: swap in the language table (preloaded) or fetch it (fallback).
function activateOrFetch(lang: string): void {
  if (I18N._locales && I18N._locales[lang]) {
    activateLanguage(Object.assign({}, EMBEDDED_EN, I18N._locales[lang]));
  } else {
    loadLocale(lang);
    activateLanguage(Object.assign({}, EMBEDDED_EN));
  }
}

async function loadLocale(lang: string): Promise<void> {
  try {
    // Resolve locales relative to THIS module's URL, not the page URL — the
    // module is served from /ithmb-decoder/ and may be injected into root
    // pages (via nav.js), where a bare "locales/..." path would 404.
    const base = new URL(".", import.meta.url).href;
    const resp = await fetch(base + "locales/" + lang + ".json", { cache: "no-cache" });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const data = (await resp.json()) as Record<string, string>;
    if (I18N.lang !== lang) return; // a newer setLang() superseded this fetch
    // Locale JSON landed AFTER setLang's early dispatch — activate so
    // subscribers (app.js reRenderCards) rebuild with real translations,
    // not the embedded English defaults.
    activateLanguage(Object.assign({}, EMBEDDED_EN, data));
  } catch (e) {
    // Embedded defaults already cover the UI — nothing to recover.
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
// Either way preloadLocales() fills the cache so a later setLang() is an
// instant in-memory swap with no fetch.
const forced = forcedLang();
if (forced) {
  I18N.lang = forced;
  loadLocale(forced);
  preloadLocales();
} else {
  setLang(detectLang());
  preloadLocales();
}

// Expose globals for classic scripts (nav.js, footer.js, etc.).
window.I18N = I18N;
window.t = t;
window.setLang = setLang;
