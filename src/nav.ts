import { pathnameLocale, setLocalePreference } from "../ithmb-decoder/locale.js";
import { createBackgroundInert, createModal, siteBackground, type Modal } from "./modal.js";
import { activeSection, renderNavShell } from "./shell.js";

(() => {
  const path = window.location.pathname;
  const isZh = pathnameLocale(path) === "zh";

  const openInNewTabHint = isZh ? "（在新标签页打开）" : "(opens in a new tab)";
  const viewSourceLabel = isZh ? "在 GitHub 上查看源码" : "View source on GitHub";
  const confirmCancelLabel = isZh ? "取消" : "Cancel";

  // The shell (skip link + nav) is rendered into the HTML at build time so
  // crawlers/no-JS users get every link. Only inject it when serving a page
  // that was not built with the shell (defensive runtime fallback).
  if (!document.querySelector("nav.top-nav")) {
    document.body.insertAdjacentHTML("afterbegin", renderNavShell({ isZh, path }));
  }

  // The built markup is baked for the canonical page URL; re-apply the active
  // state from the live path so alias URLs (/guide/, /index.html, ...) still
  // highlight the right item.
  const active = activeSection(path);
  for (const link of document.querySelectorAll<HTMLAnchorElement>(".top-nav-link[data-nav-id]")) {
    const on = active !== null && link.dataset.navId === active;
    link.classList.toggle("active", on);
    if (on) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }

  // Skip-link target: pages own their <main>; give it an id and a programmatic
  // focus target so the link actually moves keyboard focus (A11Y-04).
  // nav.js runs before <main> is parsed, so bind on DOM ready.
  const markMain = (): void => {
    const mainEl = document.querySelector("main");
    if (!mainEl) return;
    if (!mainEl.id) mainEl.id = "main";
    mainEl.setAttribute("tabindex", "-1");
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", markMain);
  } else {
    markMain();
  }
  const skipLink = document.querySelector<HTMLAnchorElement>(".skip-link");
  if (skipLink) {
    skipLink.addEventListener("click", (e) => {
      e.preventDefault();
      markMain();
      const target = document.getElementById("main") || document.querySelector("main");
      if (target instanceof HTMLElement) {
        target.focus({ preventScroll: false });
        target.scrollIntoView({ block: "start" });
      }
    });
  }

  // Clicking the already-active nav item would reload the current page and
  // throw away in-page state (e.g. decoded files on the decoder). Treat it as
  // "go to top" instead of a navigation.
  for (const link of document.querySelectorAll<HTMLAnchorElement>(".top-nav-link.active")) {
    link.addEventListener("click", (e) => {
      const target = new URL(link.href, window.location.href);
      if (
        target.origin === window.location.origin &&
        target.pathname === window.location.pathname
      ) {
        e.preventDefault();
        // Tell the close path not to restore the pre-open offset: this click
        // asked to go to the top, including from the open mobile drawer.
        suppressScrollRestore = true;
        setNavPanel(false);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }

  // New-tab hint for the icon-only GitHub link: an aria-label overrides the
  // link's text content, so the hint must be part of the label itself.
  const githubLink = document.querySelector<HTMLAnchorElement>(".github-corner");
  if (githubLink) {
    githubLink.setAttribute("aria-label", viewSourceLabel + " " + openInNewTabHint);
  }

  // Persist the language preference when a language control is clicked,
  // BEFORE the plain-link navigation happens — lang-redirect.js reads it next
  // load. Both the desktop pill and the drawer link share this behaviour.
  // With decoded files loaded the switch would throw them away, so it warns
  // first (data integrity) and then navigates in the SAME tab.
  for (const toggle of document.querySelectorAll<HTMLAnchorElement>(
    "#langToggle, .nav-lang, .site-footer__lang",
  )) {
    toggle.addEventListener("click", (ev) => {
      const loaded = document.querySelectorAll(".file-card").length > 0;
      if (!loaded) {
        persistLang();
        return;
      }
      ev.preventDefault();
      void confirmDialog({
        title: isZh ? "切换语言？" : "Switch language?",
        message: isZh
          ? "切换语言会重新加载页面，已载入的文件会被清空。"
          : "This clears the files you loaded.",
        confirmLabel: isZh ? "切换语言" : "Switch language",
        cancelLabel: isZh ? "取消" : "Cancel",
      }).then((ok) => {
        if (!ok) return;
        persistLang();
        window.IthmbAllowUnload = true;
        window.location.assign(toggle.href);
      });
    });
  }
  // The locale owner persists the choice; the plain link then navigates.
  function persistLang(): void {
    setLocalePreference(isZh ? "en" : "zh");
  }

  // Theme toggle. The button exposes its state with aria-pressed (A11Y-19);
  // the visible icon already switches between moon and sun via CSS.
  // State and media-query changes are owned by theme.ts's `IthmbTheme`; the
  // nav only subscribes, so there is exactly one OS listener and one state
  // read in the page.
  const themeBtn = document.getElementById("themeToggle");
  const themeApi = window.IthmbTheme;
  if (themeBtn && themeApi) {
    const syncThemeState = (): void => {
      themeBtn.setAttribute("aria-pressed", themeApi.get() === "dark" ? "true" : "false");
    };
    syncThemeState();
    themeApi.subscribe(syncThemeState);
    themeBtn.addEventListener("click", () => themeApi.toggle());
  }

  // Hamburger disclosure (mobile): .top-nav-links becomes the panel via
  // body.nav-open; ARIA expanded/controls kept in sync (W3C APG button pattern).
  const navToggle = document.getElementById("navToggle");
  const navPanel = document.getElementById("topNavPanel");
  let navScrim: HTMLElement | null = null;
  let navScrollY = 0;
  let suppressScrollRestore = false;
  const scrollBlockers = {
    wheel(e: Event): void {
      e.preventDefault();
    },
    touchmove(e: Event): void {
      e.preventDefault();
    },
    keydown(e: KeyboardEvent): void {
      if (["PageDown", "PageUp", "Home", "End", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
      }
    },
  };
  const keepScrollPosition = (): void => {
    if (window.scrollY !== navScrollY) window.scrollTo(0, navScrollY);
  };
  function setScrollLock(locked: boolean): void {
    if (locked) {
      window.addEventListener("scroll", keepScrollPosition, { passive: true });
      window.addEventListener("wheel", scrollBlockers.wheel, { passive: false });
      window.addEventListener("touchmove", scrollBlockers.touchmove, { passive: false });
      document.addEventListener("keydown", scrollBlockers.keydown, true);
    } else {
      window.removeEventListener("scroll", keepScrollPosition);
      window.removeEventListener("wheel", scrollBlockers.wheel);
      window.removeEventListener("touchmove", scrollBlockers.touchmove);
      document.removeEventListener("keydown", scrollBlockers.keydown, true);
    }
  }
  function panelFocusables(): HTMLElement[] {
    if (!navPanel) return [];
    return [
      ...navPanel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((el) => el.offsetParent !== null);
  }
  // Background isolation for the two modal surfaces (drawer and confirm
  // dialog): everything outside the open surface leaves the tab order and the
  // accessibility tree, as the WAI-ARIA dialog/drawer patterns require. The
  // shared inert manager keys holds by reason, so the drawer can sit behind the
  // confirm dialog and each surface releases only its own hold.
  const backgroundInert = createBackgroundInert(siteBackground);
  function setNavPanel(open: boolean): void {
    if (!navToggle || !navPanel) return;
    const wasOpen = document.body.classList.contains("nav-open");
    if (open === wasOpen) return;
    if (open) navScrollY = window.scrollY;
    navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (!open) {
      if (suppressScrollRestore) suppressScrollRestore = false;
      else window.scrollTo(0, navScrollY);
    }
    document.body.classList.toggle("nav-open", open);
    // Lock background scrolling by preventing wheel/touch/scroll-key input.
    // This leaves the document scroll offset untouched, so closing (Escape,
    // scrim, resize) restores the exact pre-open position in every engine.
    document.body.classList.toggle("nav-scroll-lock", open);
    setScrollLock(open);
    // The drawer lives inside the nav, so the nav stays active while only the
    // drawer is open; the confirm dialog (a body-level overlay) inerts all of it.
    if (open) backgroundInert.hold("drawer", (el) => !el.matches("nav.top-nav"));
    else backgroundInert.release("drawer");
    if (!navScrim) {
      navScrim = document.createElement("div");
      navScrim.className = "nav-scrim";
      navScrim.addEventListener("click", () => {
        setNavPanel(false);
        navToggle.focus({ preventScroll: true });
      });
      document.body.appendChild(navScrim);
    }
    navScrim.classList.toggle("is-on", open);
    if (open) {
      // Move focus into the open panel so Tab reaches its first link.
      window.requestAnimationFrame(() => {
        const first = panelFocusables()[0];
        if (first) first.focus({ preventScroll: true });
      });
    }
  }
  if (navToggle && navPanel) {
    navToggle.addEventListener("click", () => {
      setNavPanel(navToggle.getAttribute("aria-expanded") !== "true");
    });
    document.addEventListener("keydown", (ev) => {
      if (!document.body.classList.contains("nav-open")) return;
      if (ev.key === "Escape") {
        ev.preventDefault();
        setNavPanel(false);
        navToggle.focus({ preventScroll: true });
        return;
      }
      if (ev.key !== "Tab") return;
      const focusables = panelFocusables();
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (!active || !navPanel.contains(active)) {
        ev.preventDefault();
        first.focus();
      } else if (ev.shiftKey && active === first) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && active === last) {
        ev.preventDefault();
        first.focus();
      }
    });
    navPanel.addEventListener("click", (ev) => {
      const t = ev.target as HTMLElement | null;
      if (t && t.closest("a")) setNavPanel(false);
    });
    window.addEventListener("resize", () => {
      if (window.innerWidth > 834 && document.body.classList.contains("nav-open"))
        setNavPanel(false);
    });
  }

  // Accessible confirm dialog (used by Clear and by the language switch when
  // files are loaded). The shared modal controller owns the focus trap,
  // Escape/scrim dismissal, focus return and background isolation; this block
  // keeps the promise, the copy and the lazily created markup. Exposed for the
  // decoder's typed confirm() wrapper (app.js / download.js).
  let confirmResolve: ((ok: boolean) => void) | null = null;
  let confirmModal: Modal | null = null;

  function confirmDialog(opts: IthmbConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
      // A second request while a dialog is already open settles the previous
      // promise first; otherwise its caller waits forever on an overwritten
      // resolver (double-click on Clear / language switch).
      const current = document.getElementById("confirmDialog");
      if (current?.classList.contains("active")) settleConfirm(false);
      let overlay = document.getElementById("confirmDialog");
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "confirmDialog";
        overlay.className = "modal-overlay";
        overlay.setAttribute("aria-hidden", "true");
        overlay.innerHTML =
          '<div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="confirmTitle" aria-describedby="confirmMessage" tabindex="-1">' +
          '<h2 class="modal-title" id="confirmTitle" tabindex="-1"></h2>' +
          '<p class="modal-desc" id="confirmMessage"></p>' +
          '<div class="confirm-form-actions">' +
          '<button type="button" class="btn btn-small btn-outline" data-confirm="cancel"></button>' +
          '<button type="button" class="btn btn-small btn-primary" data-confirm="ok"></button>' +
          "</div></div>";
        document.body.appendChild(overlay);
      }
      const title = overlay.querySelector<HTMLElement>("#confirmTitle")!;
      const message = overlay.querySelector<HTMLElement>("#confirmMessage")!;
      const cancel = overlay.querySelector<HTMLButtonElement>('[data-confirm="cancel"]')!;
      const okBtn = overlay.querySelector<HTMLButtonElement>('[data-confirm="ok"]')!;
      title.textContent = opts.title;
      message.textContent = opts.message;
      okBtn.textContent = opts.confirmLabel;
      cancel.textContent = opts.cancelLabel || confirmCancelLabel;

      confirmResolve = resolve;
      overlay.classList.add("active");
      overlay.setAttribute("aria-hidden", "false");
      document.body.classList.add("modal-open");
      void overlay.offsetHeight;
      confirmModal ??= createModal({
        overlay,
        dialog: overlay.querySelector<HTMLElement>(".modal-dialog")!,
        onDismiss: () => settleConfirm(false),
        initialFocus: () => overlay!.querySelector<HTMLElement>("#confirmTitle"),
        inert: backgroundInert,
        inertReason: "dialog",
        fallbackFocus: () => {
          // The opener may have been a drawer link that closed with the drawer.
          // Prefer a visible language trigger, then the hamburger.
          for (const selector of [".nav-lang", "#langToggle", "#navToggle"]) {
            const candidate = document.querySelector<HTMLElement>(selector);
            if (candidate && candidate.offsetParent !== null) return candidate;
          }
          return null;
        },
      });
      confirmModal.open();
    });
  }
  function settleConfirm(ok: boolean): void {
    const overlay = document.getElementById("confirmDialog");
    if (!overlay || !overlay.classList.contains("active")) return;
    overlay.classList.remove("active");
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    // Release the dialog's background isolation and restore focus (the return
    // target usually lives in the previously inert main/header) before the
    // caller's promise resolves.
    confirmModal?.close();
    const resolver = confirmResolve;
    confirmResolve = null;
    resolver?.(ok);
  }
  document.addEventListener(
    "click",
    (ev) => {
      const overlay = document.getElementById("confirmDialog");
      if (!overlay || !overlay.classList.contains("active")) return;
      const target = ev.target as Element | null;
      if (target === overlay) settleConfirm(false);
      else if (target?.closest('[data-confirm="ok"]')) settleConfirm(true);
      else if (target?.closest('[data-confirm="cancel"]')) settleConfirm(false);
    },
    true,
  );
  window.IthmbConfirm = confirmDialog;

  // Glass nav: only the scrolled state gets a backdrop pass. Passive +
  // rAF-throttled so scrolling stays cheap; paint-only change, no layout.
  let scrolledTicking = false;
  const syncScrolledState = (): void => {
    scrolledTicking = false;
    document.body.classList.toggle("is-scrolled", window.scrollY > 4);
  };
  window.addEventListener(
    "scroll",
    () => {
      if (scrolledTicking) return;
      scrolledTicking = true;
      requestAnimationFrame(syncScrolledState);
    },
    { passive: true },
  );
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncScrolledState);
  } else {
    syncScrolledState();
  }

  // Scroll reveals for the marketing pages.
  const ready = (fn: () => void): void => {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  };
  ready(() => {
    const items = Array.from(document.querySelectorAll<HTMLElement>(".rv"));
    if (items.length === 0) return;
    document.documentElement.classList.add("js");
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("rv-in");
              io.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.05, rootMargin: "0px 0px -6% 0px" },
      );
      items.forEach((el) => io.observe(el));
      requestAnimationFrame(() =>
        items.forEach((el) => {
          if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add("rv-in");
        }),
      );
    } else {
      items.forEach((el) => el.classList.add("rv-in"));
    }
  });
})();
