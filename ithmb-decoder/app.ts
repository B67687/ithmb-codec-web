import { applyGlobalFormatToCards, reRenderCards } from "./card-success-ui.js";
import { downloadAll } from "./download.js";
import { I18N, t, whenLocaleReady } from "./i18n.js";
import { setupHoldRepeat } from "./input.js";
import init from "./ithmb_wasm.js";
import { INIT_TIMEOUT_MS, LIMIT_VALUES } from "./limits.js";
import { S } from "./state.js";
import { dismissBatchSummary, processFiles, emptySkips, showBatchSummary } from "./ui.js";
import { DEFAULT_FORMAT, confirm, showToast } from "./utils.js";
import { nextViewer, openViewer, prevViewer, updateToolbar } from "./viewer.js";

// The watchdog (classic script in <head>, started at navigation) uses this to
// tell "the module graph never finished" apart from "modules ran, init slow".
(window as unknown as { __ithmbAppModuleRan?: boolean }).__ithmbAppModuleRan = true;

// Always start at top on (re)load — except when returning via browser Back,
// where the user expects their previous scroll position (not 0).
if ("scrollRestoration" in history) {
  // Native restore on Back; we only force top on fresh loads below.
  history.scrollRestoration = "auto";
}
const navEntry = performance.getEntriesByType("navigation")[0] as
  | PerformanceNavigationTiming
  | undefined;
if (navEntry?.type !== "back_forward") {
  window.scrollTo(0, 0);
}

// DOM references
const dropzone = document.getElementById("dropzone")!;
const fileInput = document.getElementById("fileInput") as HTMLInputElement;
const fileList = document.getElementById("file-list")!;
const overlay = document.getElementById("dropOverlay")!;
const decodingEl = document.getElementById("decoding");

// Publish the empty app state (see updateToolbar for the transition updates):
// tests poll these attributes instead of sleeping after a page load. The
// decoder init state lives on <html> (decoder-boot.ts / markReady / watchdog).
function publishIdleState(): void {
  document.body.dataset.decodePhase = "idle";
  document.body.dataset.decodedCount = "0";
  document.body.dataset.fileCount = "0";
  document.body.dataset.pendingDecodes = "0";
  document.body.dataset.viewerState = "closed";
}
publishIdleState();

document.getElementById("batchNotice")?.addEventListener("click", (e) => {
  if ((e.target as Element | null)?.closest("[data-dismiss-batch]")) dismissBatchSummary();
});

// Init gate (edge-audit F04): every input path waits for the WASM module.
// Files dropped while it initialises are queued and decoded once ready; no
// card ever renders a terminal error for a pre-init failure.
let decoderReady = false;
const queuedBatches: File[][] = [];
// decoder-boot.js (classic script in <head>) starts the WASM download at
// navigation and owns the loading label while bytes stream in; app.js takes
// the label over once the download is done ("Preparing decoder…").
function bootApi():
  | {
      load: () => Promise<ArrayBuffer>;
      setStage: (stage: string) => void;
      ready: () => void;
      hide: () => void;
      reset: () => void;
      progress: { stage: string };
    }
  | undefined {
  return (window as unknown as { __ithmbBoot?: ReturnType<typeof bootApi> }).__ithmbBoot;
}
// Loading visibility is owned by decoder-boot.js (delayed 2 s reveal, real
// progress). This function only finishes/hides the state. The idle drop card
// stays interactive while the decoder initialises: drops are queued.
function setPreparing(on: boolean): void {
  if (on) return; // the boot script reveals progress only after its delay
  if (decodingEl) decodingEl.setAttribute("hidden", "");
  dropzone.setAttribute("aria-disabled", "false");
  dropzone.style.pointerEvents = "";
  dropzone.style.opacity = "";
}
function runFiles(files: File[]): void {
  if (files.length === 0) return;
  if (!decoderReady) {
    queuedBatches.push(files);
    return;
  }
  void processFiles(files);
}

// Dropzone activation: mouse click opens the picker; Enter/Space do the same
// for keyboard users (the element is a role="button" with tabindex="0").
// A single persistent <input type="file"> backs every affordance (drop card,
// "add files" icon) so a second batch is possible after the drop card is gone.
function openFilePicker(): void {
  fileInput.value = "";
  fileInput.click();
}

fileInput.addEventListener("change", () => {
  if (fileInput.files && fileInput.files.length > 0) {
    runFiles(Array.from(fileInput.files));
  }
});

dropzone.addEventListener("click", openFilePicker);
dropzone.addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    openFilePicker();
  }
});

// "Try a sample file": fetch the bundled small sample so the loaded state can
// be seen in one click. It goes through the exact same processFiles pipeline
// as a real drop (dedup, validation, decode, viewer).
const sampleBtn = document.getElementById("sampleBtn");
sampleBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  try {
    const res = await fetch("/samples/sample.ithmb", { cache: "no-cache" });
    if (!res.ok) throw new Error("sample fetch failed: " + res.status);
    const blob = await res.blob();
    const file = new File([blob], "sample.ithmb", { type: "application/octet-stream" });
    await runFiles([file]);
  } catch {
    showToast(t("decoder.sampleFailed"));
  }
});

const addFilesBtn = document.getElementById("addFilesBtn");
if (addFilesBtn) addFilesBtn.addEventListener("click", openFilePicker);

const clearBtn = document.getElementById("clearBtn");
if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    // Clearing reloads the page, which throws away every decoded file: confirm
    // first with the accessible, focus-trapped dialog when there is something
    // to lose (SECURITY > PRIVACY > DATA INTEGRITY > A11Y > CONVENIENCE).
    if (document.querySelectorAll(".file-card").length === 0) {
      window.location.reload();
      return;
    }
    const ask = confirm({
      title: t("app.clearTitle"),
      message: t("app.clearConfirm"),
      confirmLabel: t("app.clearAction"),
      cancelLabel: t("ui.cancel"),
    });
    void ask.then((ok) => {
      if (ok) {
        window.IthmbAllowUnload = true;
        window.location.reload();
      }
    });
  });
}

function clearDragState(): void {
  overlay.classList.remove("active");
  dropzone.classList.remove("drag-over");
  document.body.classList.remove("drag-active");
}
// Full-page drop overlay (lastTarget caching pattern from production apps)
document.addEventListener("dragover", (e) => {
  if (e.dataTransfer!.types.includes("Files")) e.preventDefault();
});
document.addEventListener("dragenter", (e) => {
  if (!e.dataTransfer!.types.includes("Files")) return;
  S.lastTarget = e.target;
  overlay.classList.add("active");
  dropzone.classList.add("drag-over");
  document.body.classList.add("drag-active");
});
document.addEventListener("dragleave", (e) => {
  if (e.target === S.lastTarget || e.target === document) {
    clearDragState();
  }
});
document.addEventListener("drop", (e) => {
  e.preventDefault();
  clearDragState();
  if (
    e.dataTransfer!.files &&
    e.dataTransfer!.files.length > 0 &&
    e.dataTransfer!.types.includes("Files")
  ) {
    const items = Array.from(e.dataTransfer?.items ?? []);
    const hasDirectory = items.some((item) => {
      if (item.kind !== "file") return false;
      const entry = item.webkitGetAsEntry?.();
      return !!entry?.isDirectory;
    });
    if (hasDirectory) {
      showBatchSummary({ ...emptySkips(), folders: 1 });
    }
    if (e.dataTransfer!.files.length > 0) {
      runFiles(Array.from(e.dataTransfer!.files));
    }
  }
});
document.addEventListener("dragend", () => {
  clearDragState();
});

setupHoldRepeat("prevBtn", prevViewer);
setupHoldRepeat("nextBtn", nextViewer);

document.getElementById("helpBtn")!.addEventListener("click", () => {
  // The limits sentence is one template; the numbers come from LIMITS so the
  // help toast can never quote a cap the session code does not enforce.
  showToast(t("app.help", LIMIT_VALUES));
});
document.getElementById("downloadAllBtn")!.addEventListener("click", downloadAll);
// Swipe navigation on mobile — works with the scroll container in viewer.js
// Simple swipe navigation on mobile
let touchStartX = 0;
let touchStartY = 0;
// Shared guard: only swipe when cards exist, the viewer is open, and the
// touch began inside the viewer stage.
function isViewerSwipeActive(e: TouchEvent): boolean {
  if (document.querySelectorAll(".file-card").length === 0 || S.viewerIndex < 0) return false;
  if (!(e.target instanceof Element) || !e.target.closest("#viewer-stage")) return false;
  return true;
}
document.addEventListener(
  "touchstart",
  (e) => {
    if (!isViewerSwipeActive(e)) return;
    const t0 = e.changedTouches[0];
    if (!t0) return;
    touchStartX = t0.screenX;
    touchStartY = t0.screenY;
  },
  { passive: true },
);
document.addEventListener(
  "touchmove",
  (e) => {
    if (!isViewerSwipeActive(e)) return;
    const t0 = e.changedTouches[0];
    if (!t0) return;
    const deltaX = Math.abs(t0.screenX - touchStartX);
    const deltaY = Math.abs(t0.screenY - touchStartY);
    if (deltaX > deltaY && deltaX > 10) e.preventDefault();
  },
  { passive: false },
);
document.addEventListener(
  "touchend",
  (e) => {
    if (!isViewerSwipeActive(e)) return;
    const t0 = e.changedTouches[0];
    if (!t0) return;
    const deltaX = t0.screenX - touchStartX;
    if (Math.abs(deltaX) > 50) {
      if (deltaX < 0) nextViewer();
      else prevViewer();
    }
  },
  { passive: true },
);
// Keyboard navigation in viewer mode. Global single-key shortcuts must never
// fire while the user is typing or while a dialog/drawer owns the keyboard.
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (isTypingTarget(e.target)) return;
  if ((document.activeElement as Element | null)?.closest("#file-list")) return;
  if (document.body.classList.contains("modal-open")) return;
  if (document.body.classList.contains("nav-open")) return;
  if (document.querySelectorAll(".file-card").length === 0 || S.viewerIndex < 0) return;
  if (e.key === "ArrowRight" || e.key === "ArrowDown") {
    e.preventDefault();
    nextViewer();
  }
  if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
    e.preventDefault();
    prevViewer();
  }
});

// Failure cards offer "Try another file" — one delegated handler keeps the
// per-card markup (rebuilt on language switch) handler-free.
document.addEventListener("click", (e) => {
  const trigger = (e.target as Element | null)?.closest("[data-open-picker]");
  if (!trigger) return;
  e.preventDefault();
  fileInput.value = "";
  fileInput.click();
});

// Clicking a result card shows it on the big stage (in both grid and viewer
// states). Interactive children (save button, format select, failure links)
// keep their own behaviour.
fileList.addEventListener("click", (e) => {
  const target = e.target as Element | null;
  if (target?.closest("button, select, input, a, label, [data-save], .failure-info")) {
    return;
  }
  const card = target?.closest(".file-card");
  if (!card) return;
  const cards = [...fileList.querySelectorAll(".file-card")];
  const idx = cards.indexOf(card as HTMLElement);
  if (idx >= 0) {
    openViewer(idx);
    showViewerContribution(idx);
  }
});

// Results grid keyboard model (edge-audit F07): ONE tab stop for the whole
// grid; arrows move focus between cards; Enter/Space opens the viewer.
fileList.setAttribute("role", "region");
fileList.setAttribute("aria-roledescription", "decoded images");
function cardEls(): HTMLElement[] {
  return [...fileList.querySelectorAll<HTMLElement>(".file-card")];
}
function setRoving(card: HTMLElement): void {
  for (const el of cardEls()) el.tabIndex = el === card ? 0 : -1;
}
fileList.addEventListener("focusin", (e) => {
  const card = (e.target as Element | null)?.closest<HTMLElement>(".file-card");
  if (card) setRoving(card);
});
fileList.addEventListener("keydown", (e) => {
  const card = (e.target as Element | null)?.closest<HTMLElement>(".file-card");
  if (!card) return;
  const cards = cardEls();
  const idx = cards.indexOf(card);
  if (e.key === "Enter" || e.key === " ") {
    if ((e.target as Element).closest("button, select, input, a, label")) return;
    e.preventDefault();
    openViewer(idx);
    showViewerContribution(idx);
    return;
  }
  const delta =
    e.key === "ArrowRight" || e.key === "ArrowDown"
      ? 1
      : e.key === "ArrowLeft" || e.key === "ArrowUp"
        ? -1
        : 0;
  if (!delta) return;
  e.preventDefault();
  const next = cards[Math.max(0, Math.min(cards.length - 1, idx + delta))];
  if (next) {
    next.focus({ preventScroll: true });
    next.scrollIntoView({ block: "nearest" });
  }
});
function showViewerContribution(idx: number): void {
  const viewer = document.getElementById("viewer-container");
  if (viewer) {
    const rect = viewer.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > window.innerHeight) {
      viewer.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
  const total = cardEls().length;
  showToast(t("viewer.showing", { i: idx + 1, n: total }));
}

// Scroll-aware back-to-top + back-to-position
let savedScrollY = 0;
const backToTop = document.getElementById("backToTop")!;
const backToPos = document.getElementById("backToPosition")!;
const backToTopLink = document.getElementById("backToTopLink")!;
const backToPosLink = document.getElementById("backToPositionLink")!;

function setBackToTop(show: boolean): void {
  backToTop.style.display = show ? "block" : "none";
}

// Show/hide back-to-top based on scroll
document.addEventListener(
  "scroll",
  () => {
    if (document.querySelectorAll(".file-card").length === 0) return;
    const viewer = document.getElementById("viewer-container");
    const fileListEl = document.getElementById("file-list");
    const viewerH = viewer ? viewer.offsetHeight : 600;
    const fileListTop = fileListEl ? fileListEl.offsetTop : 0;
    const threshold = Math.max(fileListTop + viewerH * 3, 1000);
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const absThreshold = Math.min(threshold, maxScroll * 0.8);
    setBackToTop(window.scrollY > absThreshold);
    // Hide back-to-position if user scrolls manually
    if (window.scrollY > 50) backToPos.style.display = "none";
  },
  { passive: true },
);

backToTopLink.addEventListener("click", (e) => {
  e.preventDefault();
  savedScrollY = window.scrollY;
  window.scrollTo({ top: 0, behavior: "instant" });
  // Show back-to-position button
  backToPos.style.display = "block";
  // Auto-hide after 8 seconds
  setTimeout(() => {
    backToPos.style.display = "none";
  }, 8000);
});

backToPosLink.addEventListener("click", (e) => {
  e.preventDefault();
  window.scrollTo({ top: savedScrollY, behavior: "instant" });
  backToPos.style.display = "none";
});

// Prevent any element from being dragged (stops accidental file-drop triggers)
document.addEventListener("dragstart", (e) => e.preventDefault());

// Download format: the visible control is the reference segmented row; the
// native <select> stays in the DOM as the functional backing store.
const fmtSelectEl = document.getElementById("downloadFormatSelect") as HTMLSelectElement | null;
const fmtSeg = document.getElementById("fmtSeg");
if (fmtSeg && fmtSelectEl) {
  fmtSeg.addEventListener("click", (e) => {
    const btn = (e.target as Element | null)?.closest<HTMLElement>("[data-format]");
    if (!btn) return;
    S.downloadFormat = btn.dataset.format || DEFAULT_FORMAT.mime;
    fmtSelectEl.value = S.downloadFormat;
    fmtSelectEl.dispatchEvent(new Event("change"));
    // The segmented row is the ZIP format; per-card "Save as" controls follow
    // the same default so the two controls never disagree (F04).
    applyGlobalFormatToCards();
    updateToolbar();
  });
}

// Download format dropdown (backing store for the segmented control)
document
  .getElementById("downloadFormatSelect")!
  .addEventListener("change", function (this: HTMLSelectElement) {
    S.downloadFormat = this.value;
    updateToolbar();
  });
// W3 no-hang: wasm fetch/instantiation can stall forever on a flaky
// connection (fetch never settles). Cap init so the page always lands on
// either the decoder or the honest load-failed + retry UI — never a
// permanent spinner. The duration is shared with decoder-watchdog.ts
// (INIT_TIMEOUT_MS in limits.ts): the watchdog's clock starts at navigation,
// this cap covers a stall after the module has run.
function initWithTimeout(): Promise<unknown> {
  const boot = bootApi();
  const load = boot
    ? boot.load().then(async (wasmBytes) => {
        boot.setStage("prepare");
        // Compile the preloaded bytes off the main thread, then instantiate
        // from the module. (A synthetic streaming Response breaks WebKit's
        // instantiation, and compiling bytes inline would be a long task on a
        // 4x-throttled CPU.)
        return WebAssembly.compile(wasmBytes).then(
          (module) => init({ module_or_path: module }),
          () => init({ module_or_path: wasmBytes }),
        );
      })
    : init();
  return Promise.race([
    load,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("wasm init timeout")), INIT_TIMEOUT_MS),
    ),
  ]);
}

type FailureApi = {
  showFailure: (body: string, detail?: string) => void;
  hideFailure: () => void;
  onRetry: (handler: (() => Promise<void>) | null) => void;
};
function failureApi(): FailureApi | undefined {
  return (window as unknown as { IthmbAppFailure?: FailureApi }).IthmbAppFailure;
}

function markReady(): void {
  decoderReady = true;
  (window as unknown as { IthmbDecoderReady?: boolean }).IthmbDecoderReady = true;
  document.documentElement.dataset.decoderState = "ready";
  bootApi()?.ready();
  failureApi()?.hideFailure();
  failureApi()?.onRetry(null);
  setPreparing(false);
  dropzone.setAttribute("aria-disabled", "false");
  dropzone.style.pointerEvents = "";
  dropzone.style.opacity = "";
}

async function drainQueued(): Promise<void> {
  const queued = queuedBatches.splice(0);
  for (const batch of queued) await processFiles(batch);
}

async function showInitFailure(error: unknown): Promise<void> {
  const rawDetail = error instanceof Error && error.message ? error.message : "";
  document.documentElement.dataset.decoderState = "failed";
  // A timeout can leave the boot fetch cached and hung: abort/clear it so a
  // later Retry always starts a new request.
  bootApi()?.reset();
  bootApi()?.hide();
  const api = failureApi();
  if (!api) return;
  api.onRetry(async () => {
    try {
      document.documentElement.dataset.decoderState = "booting";
      await initWithTimeout();
      markReady();
      await drainQueued();
    } catch (e2) {
      await showInitFailure(e2);
      throw e2;
    }
  });
  // On a forced-language page (every /zh/ page declares lang="zh-CN") the
  // embedded English defaults are active until the locale JSON lands. Wait for
  // that swap so the panel never renders an English body on a Chinese page.
  // If the locale itself failed to load, pass no body: the watchdog falls back
  // to its own localized copy.
  await whenLocaleReady();
  const isZh = I18N.lang === "zh";
  api.showFailure(I18N.loaded ? t("app.loadFailedMsg") : "", isZh ? "" : rawDetail);
  // Hide the "preparing" spinner FIRST: setPreparing(false) re-enables the
  // dropzone (aria-disabled=false), so disabling has to come after it or the
  // failure panel would sit next to an enabled drop target.
  setPreparing(false);
  dropzone.setAttribute("aria-disabled", "true");
  dropzone.style.pointerEvents = "none";
  dropzone.style.opacity = "0.55";
}

// Init. The watchdog panel is the single failure surface; retry goes through
// the same markReady()/drainQueued() path so a recovered decoder is fully live.
(async () => {
  try {
    await initWithTimeout();
    markReady();
    await drainQueued();
  } catch (e) {
    void showInitFailure(e);
  }
})();

// Guard accidental navigation/tab close while decoded results exist
// (edge-audit F10). Clear and the language toggle set the allow flag once the
// user has confirmed.
window.addEventListener("beforeunload", (e) => {
  if (window.IthmbAllowUnload) return;
  if (document.querySelectorAll(".file-card").length === 0) return;
  e.preventDefault();
  e.returnValue = "";
});

// Re-render result cards when the language changes (fired by i18n.js setLang).
// Keeps i18n.js dependency-free — the event is the decoupling point.
window.addEventListener("languagechange", () => {
  reRenderCards();
  // In-progress cards (status still shows the loading spinner) are NOT in
  // the completed lists reRenderCards rebuilds — re-translate their
  // "Decoding…" placeholder so it follows the language mid-decode.
  document.querySelectorAll(".file-card .status.loading").forEach((s) => {
    s.innerHTML = '<span class="spinner"></span> ' + t("viewer.decoding");
  });
  // updateToolbar derives the toggle label from viewer state (the button has
  // NO data-i18n — its label names the view you'll switch TO) and re-
  // translates the Download All button / toolbar meta line.
  updateToolbar();
  // If the viewer is open, rebuild its stage + toolbar so the failure card,
  // header, and download button re-translate immediately (not
  // just on the next image navigation).
  if (S.viewerIndex >= 0 && document.getElementById("viewer-container")?.style.display !== "none") {
    openViewer(S.viewerIndex);
    updateToolbar();
  }
});
