// privacy/toc.ts — classic script for the privacy "on this page" rail.
// Kept external because the shipped CSP has no 'unsafe-inline'. The position
// spy, click lock and aria-current handling come from the shared scrollspy
// helper; this file only supplies the section mapping and the header threshold.
import { initScrollspy, type ScrollspyEntry } from "../src/scrollspy.js";

(() => {
  const links = [...document.querySelectorAll<HTMLElement>(".privacy-toc__link")];
  if (!links.length) return;
  const entries: ScrollspyEntry[] = [];
  for (const link of links) {
    const href = link.getAttribute("href") || "";
    if (!href.startsWith("#")) continue;
    const target = document.querySelector<HTMLElement>(href);
    if (target) entries.push({ link, target });
  }
  if (!entries.length) return;

  // Position-based scrollspy: the last section whose top has passed the
  // sticky-header threshold wins. At the very bottom the last section wins
  // even when a taller preceding section still overlaps the viewport, which
  // is what a reader at the end of the page expects.
  const headerThreshold = (): number => {
    const nav = document.querySelector(".top-nav");
    return (nav ? nav.getBoundingClientRect().height : 0) + 32;
  };
  const isNearBottom = (): boolean =>
    window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;

  initScrollspy({
    entries,
    activeIndex: () => {
      const threshold = headerThreshold();
      let current = 0;
      entries.forEach((entry, index) => {
        if (entry.target.getBoundingClientRect().top <= threshold) current = index;
      });
      return isNearBottom() ? entries.length - 1 : current;
    },
  });
})();
