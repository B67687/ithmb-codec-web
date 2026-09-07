(() => {
  // Footer text is i18n-aware: "Powered by" and "Buy me a coffee" come from
  // the locale tables. footer.ts is a classic script (not a module), so it
  // can't import i18n.ts — it reads the window-level hook (i18n.ts sets
  // window.t). i18n.ts may load AFTER this script (home page: footer at
  // line ~344, i18n injected by nav.ts as a deferred module), so wait for
  // window.t to appear before rendering; the languagechange event then
  // keeps it in sync.
  function currentT(): (k: string, params?: Record<string, string | number>) => string {
    return (typeof window.t === "function" && window.t) || ((k: string) => k);
  }
  function renderFooter(): void {
    // Don't render until i18n is ready: showing the raw-key fallback would
    // flash "footer.poweredBy" text. The setInterval below re-renders once
    // window.t appears.
    if (typeof window.t !== "function") return;
    // Use a FRESH t() each render — window.t may appear after this classic
    // script loads (module scripts are deferred), so never cache the fallback.
    const t = currentT();
    var footerHtml: string =
      "<footer>" +
      "<div>" +
      '<a href="https://github.com/B67687/Ithmb-Codec" target="_blank" rel="noopener" aria-label="GitHub">' +
      '<svg width="16" height="16" viewBox="0 0 16 16" fill="#7c3aed" style="vertical-align:middle;display:inline-block">' +
      '<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>' +
      "</svg>" +
      "</a>" +
      t("footer.poweredBy") +
      ' <a href="https://github.com/B67687/Ithmb-Codec">Ithmb-Codec</a>' +
      t("footer.poweredBySuffix") +
      " \u00B7 " +
      '<a href="/enterprise/" rel="noopener">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:middle;display:inline-block" aria-hidden="true">' +
      '<path fill-rule="evenodd" d="M7.5 5.25a3 3 0 0 1 3-3h3a3 3 0 0 1 3 3V6h1.5A4.5 4.5 0 0 1 22.5 10.5v6a4.5 4.5 0 0 1-4.5 4.5H6a4.5 4.5 0 0 1-4.5-4.5v-6A4.5 4.5 0 0 1 6 6h1.5v-.75ZM15 5.25a1.5 1.5 0 0 0-1.5-1.5h-3a1.5 1.5 0 0 0-1.5 1.5V6h6v-.75Z" clip-rule="evenodd"/>' +
      '<path d="M3 12.75a6 6 0 0 1 9-5.197V9.75a.75.75 0 0 0 1.5 0V7.553a6 6 0 0 1 9 5.197v4.05c0 1.824-1.479 3.3-3.3 3.3H6.3A3.3 3.3 0 0 1 3 16.8v-4.05Z"/>' +
      "</svg> " +
      t("home.enterprise") +
      "</a>" +
      " \u00B7 " +
      '<a href="/privacy/" rel="noopener">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block" aria-hidden="true">' +
      '<path d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"/>' +
      "</svg> " +
      t("footer.privacy") +
      "</a>" +
      " \u00B7 " +
      '<a href="https://buymeacoffee.com/ThumbNami" target="_blank" rel="noopener">' +
      '<img src="/bmc-icon.svg" alt="" width="14" height="20" style="vertical-align:middle;display:inline-block">' +
      " " +
      t("footer.buyCoffee") +
      "</a>" +
      "</div>" +
      "</footer>";
    var old: HTMLElement | null = document.querySelector("footer");
    if (old) old.remove();
    document.body.insertAdjacentHTML("beforeend", footerHtml);
  }
  renderFooter();
  window.addEventListener("languagechange", renderFooter);
  // If i18n.js hasn't loaded yet (it's a deferred module on some pages),
  // re-render once it exposes window.t so the footer doesn't show raw keys.
  if (typeof window.t !== "function") {
    var tries = 0;
    var timer = setInterval(() => {
      tries++;
      if (typeof window.t === "function" || tries > 50) {
        clearInterval(timer);
        renderFooter();
      }
    }, 100);
  }
})();
