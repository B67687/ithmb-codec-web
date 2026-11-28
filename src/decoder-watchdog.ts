// decoder-watchdog.ts — authored TypeScript, bundled by scripts/build.mts into
// the classic script `decoder-watchdog.js` (CSP: external script, no inline).
// Loaded in the decoder <head>, so both clocks start at navigation instead of
// after the ES-module graph resolves (B6):
//   * 7,000 ms (GRAPH_WATCHDOG_MS below) — if app.js has not even started to
//     execute, the module graph is blocked (ad-blocker, proxy, offline). Fast,
//     honest fallback.
//   * 15,000 ms (INIT_TIMEOUT_MS in ithmb-decoder/limits.ts, shared with
//     app.ts) — the init watchdog: if the app module did run but the decoder
//     is still not ready (WASM download/instantiate stalled), show the same
//     one failure panel.
// One failure panel for both cases. app.js calls
// window.IthmbAppFailure.showFailure()/hideFailure()/onRetry().
//
// The panel copy comes from decoder-copy.ts (bundled in), the locale from
// locale.ts — neither is hand-copied here.
import { FAILURE_COPY } from "./decoder-copy.js";
import { documentLocale } from "../ithmb-decoder/locale.js";
import { INIT_TIMEOUT_MS } from "../ithmb-decoder/limits.js";

/** Fast path: the module graph never resolved (blocked app.js / network). */
const GRAPH_WATCHDOG_MS = 7000;

const copy = () => FAILURE_COPY[documentLocale() ?? "en"];
const text = {
  title: () => copy().title,
  body: () => copy().body,
  retry: () => copy().retry,
  retrying: () => copy().retrying,
};

let panel: HTMLDivElement | null = null;
let retryBtn: HTMLButtonElement | null = null;
let retryHandler: (() => Promise<void>) | null = null;
let ready = false;

function announce(msg: string): void {
  const live = document.getElementById("liveStatus");
  if (!live) return;
  live.textContent = "";
  window.setTimeout(() => {
    live.textContent = msg;
  }, 50);
}

function buildPanel(): HTMLDivElement | null {
  if (panel) return panel;
  const host =
    document.querySelector(".decoder-hero .container") || document.querySelector(".container");
  if (!host) return null;
  const nextPanel = document.createElement("div");
  nextPanel.id = "loadFailed";
  nextPanel.className = "load-failed";
  nextPanel.setAttribute("role", "alert");
  nextPanel.hidden = true;
  const strong = document.createElement("strong");
  strong.className = "load-failed__title";
  const msg = document.createElement("p");
  msg.className = "load-failed__msg";
  const detail = document.createElement("p");
  detail.className = "load-failed__detail";
  detail.hidden = true;
  const nextRetryBtn = document.createElement("button");
  nextRetryBtn.type = "button";
  nextRetryBtn.className = "btn btn-small btn-primary load-failed__retry";
  nextRetryBtn.textContent = text.retry();
  nextRetryBtn.addEventListener("click", async () => {
    if (nextRetryBtn.disabled) return;
    nextRetryBtn.disabled = true;
    nextRetryBtn.textContent = text.retrying();
    try {
      if (retryHandler) await retryHandler();
      else window.location.reload();
    } finally {
      nextRetryBtn.disabled = false;
      nextRetryBtn.textContent = text.retry();
    }
  });
  nextPanel.append(strong, msg, detail, nextRetryBtn);
  host.appendChild(nextPanel);
  panel = nextPanel;
  retryBtn = nextRetryBtn;
  return panel;
}

function showFailure(bodyText?: string, detailText?: string): void {
  if (ready) return;
  // Publish the failure for state polling even when app.js never ran (blocked
  // module graph); app.ts sets the same value on its own failure path.
  document.documentElement.dataset.decoderState = "failed";
  const p = buildPanel();
  if (!p) return;
  panel = p;
  const titleEl = p.querySelector<HTMLElement>(".load-failed__title");
  if (titleEl) titleEl.textContent = text.title();
  // Text content only: the body can be the localized fallback or app.js's
  // locale-table message, never markup.
  const msgEl = p.querySelector<HTMLElement>(".load-failed__msg");
  if (msgEl) msgEl.textContent = bodyText || text.body();
  const detail = p.querySelector<HTMLElement>(".load-failed__detail");
  if (detail) {
    detail.textContent = detailText || "";
    detail.hidden = !detailText;
  }
  p.hidden = false;
  // The boot script may have revealed its fixed progress pill before the
  // watchdog fires (app.js blocked). Failure owns the screen: hide it and
  // release pointer events so the Retry button is hittable.
  const pill = document.getElementById("decoding");
  if (pill) {
    pill.hidden = true;
    pill.style.pointerEvents = "none";
  }
  const dz = document.getElementById("dropzone");
  if (dz) {
    dz.setAttribute("aria-disabled", "true");
    dz.style.pointerEvents = "none";
    dz.style.opacity = "0.55";
  }
  announce((bodyText || text.body()) + " " + text.retry());
  retryBtn?.focus({ preventScroll: true });
  // The panel can sit below the fold on phones (390: Retry ~853-898px).
  // Bring the primary recovery control into view without hunting.
  if (retryBtn) {
    const btn = retryBtn;
    window.requestAnimationFrame(() => {
      btn.scrollIntoView({ block: "center", behavior: "auto" });
    });
  }
}

function setReady(): void {
  ready = true;
  if (panel) {
    panel.hidden = true;
    panel.remove();
    panel = null;
  }
}

(window as unknown as { IthmbAppFailure: unknown }).IthmbAppFailure = {
  showFailure,
  hideFailure: setReady,
  onRetry(handler: (() => Promise<void>) | null): void {
    retryHandler = handler;
  },
  isReady: () => ready,
};

// The watchdog clock starts at navigation: this script runs in <head>, long
// before the module graph can execute.
const navStart = performance.now();

// Fast path: the app module never started executing → its import graph did
// not resolve. 7,000 ms leaves room for a 400 kbps/300 ms cold load.
window.setTimeout(() => {
  if (ready || (window as unknown as { IthmbDecoderReady?: boolean }).IthmbDecoderReady) return;
  if ((window as unknown as { __ithmbAppModuleRan?: boolean }).__ithmbAppModuleRan) return;
  showFailure(text.body());
}, GRAPH_WATCHDOG_MS);

// Init watchdog: INIT_TIMEOUT_MS from navigation, even if modules executed
// (stalled WASM fetch or instantiation). This is the launch-gate timeout.
window.setTimeout(
  () => {
    if (ready || (window as unknown as { IthmbDecoderReady?: boolean }).IthmbDecoderReady) return;
    showFailure(text.body());
  },
  Math.max(0, INIT_TIMEOUT_MS - (performance.now() - navStart)),
);
