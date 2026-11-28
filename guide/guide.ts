/* Guide page interactions: device/OS path switcher, progress rail,
   copyable paths, and the figure lightbox. No inline scripts (CSP-safe).
   Position spy + click lock come from scrollspy.ts and the lightbox modal
   behaviour from modal.ts; both are bundled into this classic script. */
import { createBackgroundInert, createModal, siteBackground } from "../src/modal.js";
import { initScrollspy, type ScrollspyEntry } from "../src/scrollspy.js";

(() => {
  const doc = document.documentElement;
  const zh = (doc.lang || "").toLowerCase().startsWith("zh");

  // Progressive enhancement marker: CSS hides the path tabs until this runs,
  // so a no-JS visit still shows every path panel stacked.
  doc.classList.add("js");

  // ---------- device / computer path switcher ----------
  const switcher = document.querySelector("[data-guide-paths]");
  if (switcher) {
    const tabs = [...switcher.querySelectorAll<HTMLElement>("[data-path-tab]")];
    const panels = [...switcher.querySelectorAll<HTMLElement>("[data-path-panel]")];
    if (tabs.length && panels.length) {
      const activate = (name: string | null, focusTab: boolean): void => {
        for (const tab of tabs) {
          const on = tab.getAttribute("data-path-tab") === name;
          tab.setAttribute("aria-selected", on ? "true" : "false");
          tab.setAttribute("tabindex", on ? "0" : "-1");
          if (on && focusTab) tab.focus();
        }
        for (const panel of panels) {
          panel.hidden = panel.getAttribute("data-path-panel") !== name;
        }
      };

      const initialTab =
        tabs.find((tab) => tab.getAttribute("aria-selected") === "true") ?? tabs[0];
      if (initialTab) activate(initialTab.getAttribute("data-path-tab"), false);

      for (const tab of tabs) {
        tab.addEventListener("click", () => {
          activate(tab.getAttribute("data-path-tab"), false);
        });
        tab.addEventListener("keydown", (event) => {
          const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
          if (!keys.includes(event.key)) return;
          event.preventDefault();
          const index = tabs.indexOf(tab);
          let next = index;
          if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
          if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
          if (event.key === "Home") next = 0;
          if (event.key === "End") next = tabs.length - 1;
          const nextTab = tabs[next];
          if (nextTab) activate(nextTab.getAttribute("data-path-tab"), true);
        });
      }
    }
  }

  // ---------- sticky progress rail ----------
  const rail = document.querySelector(".guide-rail");
  const railLinks = [...document.querySelectorAll<HTMLElement>("[data-rail-step]")];
  const entries: ScrollspyEntry[] = [];
  for (const link of railLinks) {
    const step = link.getAttribute("data-rail-step");
    const target = step ? document.getElementById(step) : null;
    if (target) entries.push({ link, target });
  }
  const progressBar = rail ? rail.querySelector<HTMLElement>(".guide-rail__progress span") : null;

  if (rail && entries.length) {
    const updateProgress = (): void => {
      if (!progressBar) return;
      const first = entries[0]?.target;
      const last = entries[entries.length - 1]?.target;
      if (!first || !last) return;
      const start = first.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.32;
      const end =
        last.getBoundingClientRect().top +
        last.offsetHeight +
        window.scrollY -
        window.innerHeight * 0.6;
      const ratio = Math.min(1, Math.max(0, (window.scrollY - start) / Math.max(1, end - start)));
      progressBar.style.width = (ratio * 100).toFixed(1) + "%";
    };

    initScrollspy({
      entries,
      // The active step is the last section whose top has passed the 32%-
      // viewport marker.
      activeIndex: () => {
        const marker = window.scrollY + window.innerHeight * 0.32;
        let activeIndex = 0;
        entries.forEach((entry, index) => {
          if (entry.target.getBoundingClientRect().top + window.scrollY <= marker)
            activeIndex = index;
        });
        return activeIndex;
      },
      doneClass: "is-done",
      refreshOnResize: true,
      onUpdate: updateProgress,
    });
  }

  // ---------- copyable path chips ----------
  const fallbackCopy = (text: string): boolean => {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  };

  // Each copy chip gets its OWN reset timer. Re-clicking a chip replaces its
  // timer instead of overwriting the stored "Copy" label with "Copied" (the
  // old implementation captured the hint text at click time and could get
  // stuck on "Copied" forever). A polite live region announces the change.
  const copyTimers = new Map<HTMLElement, number>();
  let copyLive: HTMLElement | null = null;
  const copyLiveRegion = (): HTMLElement => {
    if (!copyLive) {
      copyLive = document.createElement("div");
      copyLive.className = "guide-copy__live";
      copyLive.setAttribute("role", "status");
      copyLive.setAttribute("aria-live", "polite");
      copyLive.setAttribute("aria-atomic", "true");
      document.body.appendChild(copyLive);
    }
    return copyLive;
  };
  const announceCopy = (message: string): void => {
    const live = copyLiveRegion();
    live.textContent = "";
    window.setTimeout(() => {
      live.textContent = message;
    }, 30);
  };
  const flashCopy = (button: HTMLElement, text: string, value: string): void => {
    const hint = button.querySelector<HTMLElement>(".guide-copy__hint");
    if (!hint) return;
    const original = button.dataset.copyOriginal ?? (hint.textContent || "Copy");
    button.dataset.copyOriginal = original;
    const pending = copyTimers.get(button);
    if (pending) window.clearTimeout(pending);
    hint.textContent = text;
    hint.classList.add("is-done");
    announceCopy(text + (value ? " " + value : ""));
    const timer = window.setTimeout(() => {
      hint.textContent = original;
      hint.classList.remove("is-done");
      copyTimers.delete(button);
    }, 1500);
    copyTimers.set(button, timer);
  };

  document.addEventListener("click", async (event) => {
    const target = event.target as Element | null;
    const button = target?.closest<HTMLElement>("[data-copy]");
    if (!button) return;
    const value = button.getAttribute("data-copy") || "";
    const done = button.getAttribute("data-copied-label") || (zh ? "已复制" : "Copied");
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(value);
        flashCopy(button, done, value);
        return;
      }
      throw new Error("no clipboard");
    } catch {
      flashCopy(button, fallbackCopy(value) ? done : zh ? "请选择" : "Select", value);
    }
  });

  // ---------- figure lightbox ----------
  const triggers = [...document.querySelectorAll<HTMLElement>("[data-guide-lightbox]")];
  if (triggers.length) {
    // Theme-aware screenshots. The markup ships a light <img> plus a
    // prefers-color-scheme dark <source>, which covers no-JS visits. The page
    // theme is owned by window.IthmbTheme and can be pinned or toggled by hand
    // while the OS preference stays put, so with JS pin the source to the
    // theme being rendered and keep each trigger's href on the file that is
    // actually displayed (modified clicks open the same variant).
    const syncFigureSources = (): void => {
      const dark = doc.dataset.theme === "dark";
      for (const trigger of triggers) {
        const source = trigger.querySelector<HTMLSourceElement>("picture > source");
        if (source) source.media = dark ? "all" : "not all";
        const thumb = trigger.querySelector<HTMLImageElement>("img");
        const target =
          dark && source ? source.getAttribute("srcset") : thumb && thumb.getAttribute("src");
        if (target) trigger.setAttribute("href", target);
      }
    };
    syncFigureSources();
    if (window.IthmbTheme && window.IthmbTheme.subscribe) {
      window.IthmbTheme.subscribe(syncFigureSources);
    }

    const overlay = document.createElement("div");
    overlay.className = "guide-lightbox";
    overlay.hidden = true;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", zh ? "截图预览" : "Screenshot preview");
    overlay.innerHTML =
      '<button class="guide-lightbox__close" type="button" aria-label="' +
      (zh ? "关闭截图" : "Close screenshot") +
      '">×</button>' +
      '<div class="guide-lightbox__inner"><img alt=""><p class="guide-lightbox__caption"></p></div>';
    document.body.appendChild(overlay);

    const image = overlay.querySelector<HTMLImageElement>("img")!;
    const caption = overlay.querySelector<HTMLElement>(".guide-lightbox__caption")!;
    const closeButton = overlay.querySelector<HTMLButtonElement>(".guide-lightbox__close")!;

    // Modal isolation: while the lightbox is open the page behind it leaves the
    // tab order and the accessibility tree. The shared controller releases it
    // before the trigger gets focus back.
    const modal = createModal({
      overlay,
      dialog: overlay,
      onDismiss: () => close(),
      initialFocus: () => closeButton,
      inert: createBackgroundInert(siteBackground),
      inertReason: "lightbox",
    });

    function close(): void {
      overlay.hidden = true;
      document.body.classList.remove("guide-lightbox-open");
      modal.close();
    }

    const open = (trigger: HTMLElement): void => {
      const figure = trigger.closest("figure");
      const figcaption = figure ? figure.querySelector("figcaption") : null;
      const thumb = trigger.querySelector<HTMLImageElement>("img");
      image.src = thumb && thumb.currentSrc ? thumb.currentSrc : trigger.getAttribute("href") || "";
      image.alt = thumb ? thumb.getAttribute("alt") || "" : "";
      caption.textContent = figcaption ? figcaption.textContent.trim().replace(/\s+/g, " ") : "";
      overlay.hidden = false;
      document.body.classList.add("guide-lightbox-open");
      modal.open(trigger);
    };

    for (const trigger of triggers) {
      trigger.addEventListener("click", (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        open(trigger);
      });
    }

    closeButton.addEventListener("click", close);
  }
})();
