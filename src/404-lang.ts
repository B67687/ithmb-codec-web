// 404-lang.ts — authored TypeScript, bundled by scripts/build.mts into the
// classic deferred script `404-lang.js` used by the root 404 page.
// Server 404s for a /zh/ URL serve the root English 404.html; this swaps its
// copy and internal links to Chinese. The pathname→locale rule lives in
// locale.ts (shared with the shell and the decoder boot scripts); the link
// remaps are derived from the page registry (routes.ts) entries flagged
// `remapOn404`, so the 404 page cannot carry its own path map.
import { pathnameLocale } from "../ithmb-decoder/locale.js";
import { ROUTES, pagePath } from "./routes.js";

function applyZhCopy(): void {
  const set = (selector: string, text: string): void => {
    const el = document.querySelector(selector);
    if (el) el.textContent = text;
  };
  document.documentElement.lang = "zh-CN";
  document.title = "页面不存在 | ITHMB Codec";
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.setAttribute("content", "页面不存在。可能已经搬走，或者链接写错了。");
  set(".skip-link", "跳到正文");
  set(".error-section p", "这个页面不存在，可能已经搬走，或者链接写错了。");
  set(".error-section a", "打开解码器");
  // Every EN link to a page flagged remapOn404 points at its ZH canonical.
  for (const route of ROUTES) {
    if (!route.remapOn404) continue;
    const from = pagePath(route.key, "en");
    const to = pagePath(route.key, "zh");
    for (const a of document.querySelectorAll(`a[href="${from}"]`)) a.setAttribute("href", to);
  }
}

if (pathnameLocale(location.pathname) === "zh") applyZhCopy();
