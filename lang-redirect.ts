// lang-redirect.ts — synchronous classic script, loaded in <head> BEFORE
// first paint (CSP has no 'unsafe-inline', so it ships as a file). It has
// no dependency on i18n.ts or nav.ts.
//
// Redirects the visitor to the page language that matches their stored
// preference (localStorage["ithmbLang"], written by the nav language
// switcher) or, with no stored preference, the browser's language — zh
// browsers land on the /zh/ pages. It only fires across the EN <-> /zh/
// counterpart map; unmapped paths (e.g. /404.html) are left alone, and a
// /zh/ page is never bounced to English based on browser language.
//
// location.replace() is used instead of assign() so the automatic redirect
// does not pollute history: pressing Back after a language redirect goes to
// the previous page instead of bouncing the visitor between locales.
(function () {
  var path: string = window.location.pathname;

  // EN page path -> canonical zh page path (same map nav.ts uses, plus the
  // /index.html variant). Every EN and zh path form of the four content
  // pages resolves to the canonical extensionless counterpart in the other
  // language, so the redirect never strands a visitor on the wrong locale.
  var zhPages: Record<string, string> = {
    "/": "/zh/",
    "/index.html": "/zh/",
    "/ithmb-decoder": "/zh/ithmb-decoder/",
    "/ithmb-decoder/": "/zh/ithmb-decoder/",
    "/ithmb-decoder/index.html": "/zh/ithmb-decoder/",
    "/guide": "/zh/guide/how-to-open-ithmb-files",
    "/guide/": "/zh/guide/how-to-open-ithmb-files",
    "/guide/how-to-open-ithmb-files": "/zh/guide/how-to-open-ithmb-files",
    "/guide/how-to-open-ithmb-files.html": "/zh/guide/how-to-open-ithmb-files",
    "/enterprise": "/zh/enterprise/",
    "/enterprise/": "/zh/enterprise/",
    "/enterprise/index.html": "/zh/enterprise/",
  };
  // zh page path -> canonical EN counterpart (explicit, not derived, so the
  // extensionless forms stay canonical in both directions).
  var enPages: Record<string, string> = {
    "/zh/": "/",
    "/zh/index.html": "/",
    "/zh/ithmb-decoder/": "/ithmb-decoder/",
    "/zh/ithmb-decoder/index.html": "/ithmb-decoder/",
    "/zh/guide/how-to-open-ithmb-files": "/guide/how-to-open-ithmb-files",
    "/zh/guide/how-to-open-ithmb-files.html": "/guide/how-to-open-ithmb-files",
    "/zh/enterprise/": "/enterprise/",
    "/zh/enterprise/index.html": "/enterprise/",
  };

  var lang: string = (
    document.documentElement.getAttribute("lang") || ""
  ).toLowerCase();
  var current: string | null =
    lang.indexOf("zh") === 0 ? "zh" : lang.indexOf("en") === 0 ? "en" : null;
  if (!current) return; // page declares no supported language — nothing to do

  var saved: string | null = null;
  try {
    saved = localStorage.getItem("ithmbLang");
  } catch (e) {
    saved = null; // storage blocked (private mode / sandboxed iframe)
  }
  if (saved !== "en" && saved !== "zh") saved = null;

  var target: string | null = null;
  if (saved && saved !== current) {
    // Stored preference beats everything: redirect to the counterpart page
    // in the preferred language (a stored "en" preference redirects a /zh/
    // page to its English counterpart too).
    target = (saved === "zh" ? zhPages[path] : enPages[path]) ?? null;
  } else if (!saved && current === "en") {
    // No preference yet: zh browsers land on the Chinese pages. /zh/ pages
    // are never bounced to English.
    var nav = (navigator.language || "").toLowerCase();
    if (nav.indexOf("zh") === 0) target = zhPages[path] ?? null;
  }
  if (target) location.replace(target);
})();
