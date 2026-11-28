import { pathnameLocale } from "../ithmb-decoder/locale.js";
import { COPYRIGHT_YEAR, renderFooter } from "./shell.js";

// The footer is rendered into the HTML at build time (crawlers/no-JS). The
// runtime path only enhances it: bind the "current page" guard and inject a
// footer when serving an unbuilt page (defensive fallback). Binding is deferred
// to DOMContentLoaded because this script runs before the static footer markup
// at the end of <body> has been parsed.
function enhanceFooter(): void {
  const isZh = pathnameLocale(window.location.pathname) === "zh";
  if (!document.querySelector("footer.site-footer")) {
    document.body.insertAdjacentHTML(
      "beforeend",
      renderFooter({ isZh, year: COPYRIGHT_YEAR, path: window.location.pathname }),
    );
  }

  // A footer link to the page we are already on would reload it (and lose
  // in-page state); make it scroll to top instead.
  for (const link of document.querySelectorAll<HTMLAnchorElement>(".site-footer a[href]")) {
    link.addEventListener("click", (ev) => {
      let target: URL;
      try {
        target = new URL(link.href, window.location.href);
      } catch {
        return;
      }
      if (
        target.origin === window.location.origin &&
        target.pathname === window.location.pathname &&
        !target.hash
      ) {
        ev.preventDefault();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", enhanceFooter, { once: true });
} else {
  enhanceFooter();
}
