import init from "./ithmb_wasm.js";
import { S } from "./state.js";
import {
  openViewer,
  closeViewer,
  prevViewer,
  nextViewer,
  updateToolbar,
} from "./viewer.js";
import { processFiles } from "./ui.js";
import { downloadAll } from "./download.js";
import { formatLabels, showToast } from "./utils.js";
import { setupHoldRepeat } from "./input.js";
import { t } from "./i18n.js";
import { reRenderCards } from "./card-success-ui.js";

// Always start at top on (re)load
if ("scrollRestoration" in history) {
  history.scrollRestoration = "manual";
}
window.scrollTo(0, 0);

// DOM references
const dropzone = document.getElementById("dropzone")!;
const fileList = document.getElementById("file-list")!;
const overlay = document.getElementById("dropOverlay")!;

// Dropzone click
dropzone.addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.accept = ".ithmb,.ipm";
  input.onchange = () => {
    if (input.files) processFiles(Array.from(input.files));
  };
  input.click();
});

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
    processFiles(Array.from(e.dataTransfer!.files));
  }
});
document.addEventListener("dragend", () => {
  clearDragState();
});

setupHoldRepeat("prevBtn", prevViewer);
setupHoldRepeat("nextBtn", nextViewer);
setupHoldRepeat("viewerArrowLeft", prevViewer);
setupHoldRepeat("viewerArrowRight", nextViewer);

document.getElementById("helpBtn")!.addEventListener("click", () => {
  showToast(t("app.shortcuts"));
});
document
  .getElementById("downloadAllBtn")!
  .addEventListener("click", downloadAll);
// Toggle the viewer between grid view and the single-image viewer.
// Shared by the viewToggleBtn click AND the g/G keyboard shortcut.
function toggleView(): void {
  const container = document.getElementById("viewer-container");
  const btn = document.getElementById("viewToggleBtn");
  if (container && container.style.display !== "none") {
    closeViewer();
    if (btn) btn.textContent = t("app.gallery");
  } else {
    openViewer(S.viewerIndex >= 0 ? S.viewerIndex : 0);
    if (btn) btn.textContent = t("app.gridView");
  }
}
document.getElementById("viewToggleBtn")!.addEventListener("click", toggleView);

// Swipe navigation on mobile — works with the scroll container in viewer.js
// Simple swipe navigation on mobile
let touchStartX = 0;
let touchStartY = 0;
// Shared guard: only swipe when cards exist, the viewer is open, and the
// touch began inside the viewer stage.
function isViewerSwipeActive(e: TouchEvent): boolean {
  if (document.querySelectorAll(".file-card").length === 0 || S.viewerIndex < 0)
    return false;
  if (!(e.target instanceof Element) || !e.target.closest("#viewer-stage"))
    return false;
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
// Keyboard navigation in viewer mode
document.addEventListener("keydown", (e) => {
  if (document.querySelectorAll(".file-card").length === 0 || S.viewerIndex < 0)
    return;
  if (e.key === "ArrowRight" || e.key === "ArrowDown") {
    e.preventDefault();
    nextViewer();
  }
  if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
    e.preventDefault();
    prevViewer();
  }
  if (e.key === "Escape") closeViewer();
  if (e.key === "g" || e.key === "G") {
    e.preventDefault();
    toggleView();
  }
});

// In viewer mode, clicking a card opens it
fileList.addEventListener("click", (e) => {
  if (fileList.classList.contains("viewer-mode")) {
    const card = (e.target as Element | null)?.closest(".file-card");
    if (card) {
      if ((e.target as Element | null)?.closest("[data-save]")) return;
      const cards = [...fileList.querySelectorAll(".file-card")];
      const idx = cards.indexOf(card);
      if (idx >= 0) {
        openViewer(idx);
      }
    }
  }
});

// Scroll-aware back-to-top + back-to-position
let savedScrollY = 0;
const backToTop = document.getElementById("backToTop")!;
const backToPos = document.getElementById("backToPosition")!;
const backToTopLink = document.getElementById("backToTopLink")!;
const backToPosLink = document.getElementById("backToPositionLink")!;

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
    const maxScroll =
      document.documentElement.scrollHeight - window.innerHeight;
    const absThreshold = Math.min(threshold, maxScroll * 0.8);
    backToTop.style.display = window.scrollY > absThreshold ? "" : "none";
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
  backToPos.style.display = "";
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

// Download format dropdown
document
  .getElementById("downloadFormatSelect")!
  .addEventListener("change", function (this: HTMLSelectElement) {
    S.downloadFormat = this.value;
    // Global selector only affects the Download All ZIP — per-card formats
    // stay independent (S.cardFormats).
    const btn = document.getElementById("downloadAllBtn");
    if (btn) {
      btn.textContent = t("app.downloadAll");
      btn.title = t("app.zipTitle", {
        fmt: formatLabels[S.downloadFormat] || "JPEG",
      });
    }
  });
// Init
try {
  await init();
} catch (e) {
  // Load failed (e.g. wasm fetch blipped, or the browser truly lacks
  // WebAssembly). Show the message + a retry that re-runs init() — a
  // transient failure (network blip) recovers; a permanent one re-enables
  // the button so the user can try again.
  const failDiv = document.createElement("div");
  failDiv.id = "loadFailed";
  failDiv.style.cssText = "text-align:center;padding:20px;color:#ff453a";
  const strong = document.createElement("strong");
  strong.textContent = t("app.loadFailedTitle");
  failDiv.appendChild(strong);
  failDiv.appendChild(document.createTextNode(" " + t("app.loadFailedMsg")));
  failDiv.appendChild(document.createElement("br"));
  const retryBtn = document.createElement("button");
  retryBtn.type = "button";
  retryBtn.className = "btn btn-small btn-primary";
  retryBtn.style.marginTop = "12px";
  retryBtn.textContent = t("app.retry");
  retryBtn.addEventListener("click", async () => {
    retryBtn.disabled = true;
    retryBtn.textContent = t("app.retrying");
    try {
      await init();
      failDiv.remove();
      dropzone.style.pointerEvents = "";
      dropzone.style.opacity = "";
    } catch (e2) {
      retryBtn.disabled = false;
      retryBtn.textContent = t("app.retry");
    }
  });
  failDiv.appendChild(retryBtn);
  document.querySelector(".container")!.appendChild(failDiv);
  // Also disable the dropzone so users know something is broken.
  dropzone.style.pointerEvents = "none";
  dropzone.style.opacity = "0.5";
}

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
  // translates the Download All button. Called here so the closed-viewer
  // state re-translates too; the open state is covered by the rebuild below.
  updateToolbar();
  // If the viewer is open, rebuild its stage + toolbar so the report link,
  // share box, header, and download button re-translate immediately (not
  // just on the next image navigation).
  if (
    S.viewerIndex >= 0 &&
    document.getElementById("viewer-container")?.style.display !== "none"
  ) {
    openViewer(S.viewerIndex);
    updateToolbar();
  }
});
