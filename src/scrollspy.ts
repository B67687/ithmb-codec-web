// scrollspy.ts — one position-based scrollspy shared by the privacy "on this
// page" rail and the guide progress rail.
//
// Both rails used to carry their own copy of the same logic: a passive,
// rAF-throttled scroll listener, `aria-current="location"` on the active link,
// and a click lock that highlights the clicked item immediately and suppresses
// the position spy until the smooth scroll lands. This module owns that shared
// behaviour; the callers only supply the page-specific geometry (which index is
// "current" here) and any extra decoration (the guide's is-done class and
// progress bar).
//
// Lock release is driven by `scrollend` with a destination-geometry fallback
// and immediate release on manual wheel/touch/key input — never a fixed timer,
// so reduced-motion jumps release at once and long scrolls hold until they land.

export interface ScrollspyEntry {
  /** The rail link that represents a section. */
  link: HTMLElement;
  /** The section the link points at. */
  target: HTMLElement;
}

export interface ScrollspyOptions {
  entries: readonly ScrollspyEntry[];
  /** Index whose target is at the current reading position; -1 for none. */
  activeIndex: () => number;
  /** Extra class applied to the entries before the active one (guide rail). */
  doneClass?: string;
  /** Recompute while unlocked after a resize (needed for a progress bar). */
  refreshOnResize?: boolean;
  /** Called after every settled position update (guide progress bar). */
  onUpdate?: () => void;
}

const ACTIVE_CLASS = "is-active";
const INTERRUPT_EVENTS = ["wheel", "touchstart", "keydown"] as const;

export function initScrollspy(options: ScrollspyOptions): void {
  const { entries } = options;
  if (entries.length === 0) return;

  // Click lock: the clicked entry stays highlighted for the whole smooth
  // scroll, so the position spy cannot flip the rail through the entries in
  // between.
  let lockedIndex = -1;
  let lockStartY = 0;
  let scrollEndHandler: (() => void) | null = null;
  const supportsScrollEnd = "onscrollend" in window;

  const setState = (index: number): void => {
    entries.forEach((entry, i) => {
      const active = i === index;
      entry.link.classList.toggle(ACTIVE_CLASS, active);
      if (options.doneClass) entry.link.classList.toggle(options.doneClass, i < index);
      if (active) entry.link.setAttribute("aria-current", "location");
      else entry.link.removeAttribute("aria-current");
    });
  };

  // Where the browser stops once it has scrolled to a target: the anchor path
  // (scroll-margin-top), clamped to the page bottom.
  const destinationFor = (target: HTMLElement): number => {
    const margin = parseFloat(window.getComputedStyle(target).scrollMarginTop) || 0;
    const top = target.getBoundingClientRect().top + window.scrollY - margin;
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    return Math.max(0, Math.min(maxScroll, top));
  };

  const atDestination = (): boolean => {
    const locked = entries[lockedIndex];
    if (lockedIndex === -1 || !locked) return false;
    return Math.abs(window.scrollY - destinationFor(locked.target)) <= 2;
  };

  function detachLock(): void {
    if (scrollEndHandler) {
      window.removeEventListener("scrollend", scrollEndHandler);
      scrollEndHandler = null;
    }
    for (const type of INTERRUPT_EVENTS) {
      window.removeEventListener(type, releaseLock, true);
    }
  }

  function update(): void {
    // Geometry fallback: only the destination counts as "arrived", so the rail
    // never re-spies mid-scroll.
    if (atDestination()) {
      lockedIndex = -1;
      detachLock();
    }
    if (lockedIndex === -1) setState(options.activeIndex());
    options.onUpdate?.();
  }

  function releaseLock(): void {
    if (lockedIndex === -1) return;
    lockedIndex = -1;
    detachLock();
    update();
  }

  function lockTo(index: number): void {
    detachLock();
    lockedIndex = index;
    lockStartY = window.scrollY;
    // Already at the entry (or no scroll needed): release on the next frame
    // instead of waiting for a scrollend that will never come.
    window.requestAnimationFrame(() => {
      if (lockedIndex === index && atDestination()) releaseLock();
    });
    if (supportsScrollEnd) {
      scrollEndHandler = () => {
        // A scrollend queued from a scroll that ended just before the click is
        // not the click's own scroll: ignore it while the page is still parked
        // where the lock started. Any finished scroll after movement releases.
        if (atDestination() || Math.abs(window.scrollY - lockStartY) > 2) releaseLock();
      };
      window.addEventListener("scrollend", scrollEndHandler);
    }
    // Manual wheel/touch/key input releases the lock at once so the rail
    // follows the reader again.
    for (const type of INTERRUPT_EVENTS) {
      window.addEventListener(type, releaseLock, true);
    }
  }

  for (const [index, entry] of entries.entries()) {
    entry.link.addEventListener("click", (event: MouseEvent) => {
      // Modified/middle clicks open a new tab and leave this page in place, so
      // they must not start a lock.
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
        return;
      setState(index);
      lockTo(index);
    });
  }

  let ticking = false;
  window.addEventListener(
    "scroll",
    () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        ticking = false;
        update();
      });
    },
    { passive: true },
  );
  window.addEventListener("resize", () => {
    if (lockedIndex !== -1) releaseLock();
    else if (options.refreshOnResize) update();
  });
  update();
}
