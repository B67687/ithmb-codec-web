import { LIMITS } from "./limits.js";
import { S } from "./state.js";
import { openViewer } from "./viewer.js";

// Create a placeholder thumb in FILE order when a card is created. The
// thumbnail image is filled in later by addFilmstripThumb() once decode
// completes. Keeping the thumbs in file order means the filmstrip, the
// arrow navigation, and the "N / M" viewer numbering all share ONE order.
//
// Thumbs are real buttons (keyboard-reachable); they live inside a dedicated
// horizontal scroll track so the count pill can stay pinned outside it.
export function createFilmstripThumb(cardId: string): void {
  const track = getTrack();
  if (!track) return;
  if (track.querySelector(`[data-filmstrip-card="${cardId}"]`)) return;
  // 200-file batches stay fast: cap the filmstrip DOM. Arrows/cards still reach
  // every image; only the thumbnail rail is windowed to its first N entries.
  if (track.querySelectorAll(".filmstrip-thumb").length >= LIMITS.FILMSTRIP_THUMBS) return;

  const card = document.getElementById(cardId);
  const nameEl = card ? card.querySelector(".name") : null;
  const thumb = document.createElement("button");
  thumb.type = "button";
  thumb.className = "filmstrip-thumb pending";
  thumb.dataset.filmstripCard = cardId;
  thumb.setAttribute("aria-label", nameEl && nameEl.textContent ? nameEl.textContent : "Thumbnail");

  thumb.addEventListener("click", () => {
    const allCards = document.querySelectorAll<HTMLElement>(".file-card");
    const target = Array.from(allCards).find((c) => c.dataset.cardId === cardId);
    const idx = target ? Array.from(allCards).indexOf(target) : 0;
    openViewer(idx);
  });

  track.appendChild(thumb);
  scheduleFadeSync();
}

// Fill an existing placeholder thumb with the decoded thumbnail (or the
// failure icon). Falls back to creating the thumb if no placeholder exists.
export function addFilmstripThumb(cardId: string, canvas?: HTMLCanvasElement): void {
  const track = getTrack();
  if (!track) return;
  let thumb = track.querySelector<HTMLElement>(`[data-filmstrip-card="${cardId}"]`);
  if (!thumb) {
    createFilmstripThumb(cardId);
    thumb = track.querySelector<HTMLElement>(`[data-filmstrip-card="${cardId}"]`);
    if (!thumb) return;
  }

  thumb.classList.remove("pending");
  thumb.classList.toggle("failed", !canvas);
  thumb.innerHTML = "";

  if (canvas) {
    const isMobile = window.innerWidth <= 560;
    // Draw the thumb at 2x its rendered box so it stays sharp on retina.
    // Rendered boxes: 80×55 desktop, 68×46 phone (see the filmstrip layer).
    const thumbW = isMobile ? 136 : 160;
    const thumbH = isMobile ? 92 : 110;
    const thumbCanvas = document.createElement("canvas");
    thumbCanvas.width = thumbW;
    thumbCanvas.height = thumbH;
    const tc = thumbCanvas.getContext("2d")!;
    tc.drawImage(canvas, 0, 0, thumbW, thumbH);
    thumb.appendChild(thumbCanvas);
  } else {
    // Failed decode: neutral material + faint centred "no image" glyph; the
    // tile ring comes from CSS so the boundary stays visible at every size.
    thumb.innerHTML = `
      <span class="film-thumb-fail" aria-hidden="true">
        <svg class="film-thumb-fail__glyph" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
          <path d="m3.6 16.4 4.9-5.1 3.7 3.7 2.6-2.3 5.6 5.5" />
          <path d="M8 9.2h.01" />
        </svg>
      </span>`;
  }

  // Ensure active thumb highlight if this thumb matches current viewer card
  if (S.viewerIndex >= 0) {
    const allCards = document.querySelectorAll<HTMLElement>(".file-card");
    const currentCard = allCards[S.viewerIndex];
    if (currentCard && thumb.dataset.filmstripCard === currentCard.dataset.cardId) {
      thumb.classList.add("active");
    }
  }
  scheduleFadeSync();
}

// ───────────────────────────── rail behaviour ─────────────────────────────

function getTrack(): HTMLElement | null {
  return document.getElementById("filmstripTrack");
}

let fadeFrame = 0;
function scheduleFadeSync(): void {
  if (fadeFrame) return;
  fadeFrame = window.requestAnimationFrame(() => {
    fadeFrame = 0;
    syncFade();
  });
}

// Toggle the edge-fade classes so the rail only fades where thumbs overflow.
// The same measurement drives centering (thumbs centred while they fit,
// left-aligned once the rail scrolls), switched exactly at the overflow
// boundary so there is no visual jump.
function syncFade(): void {
  const track = getTrack();
  if (!track) return;
  const container = document.getElementById("viewer-filmstrip");
  const reserve = container
    ? Number.parseFloat(getComputedStyle(container).getPropertyValue("--film-count-reserve")) || 0
    : 0;
  const thumbs = [...track.querySelectorAll<HTMLElement>(".filmstrip-thumb")];
  const gap = Number.parseFloat(getComputedStyle(track).gap) || 0;
  const contentWidth =
    thumbs.reduce((sum, el) => sum + el.offsetWidth, 0) + gap * Math.max(0, thumbs.length - 1);
  // Centring uses symmetric reserved space, so compare the thumb group against
  // the FULL rail width (minus both reserves), not the leftover track width.
  const railWidth = container ? container.clientWidth : track.clientWidth;
  const available = railWidth - reserve * 2;
  const hasOverflow = contentWidth > available + 1;
  track.classList.toggle("has-overflow", hasOverflow);
  track.classList.toggle("can-scroll-left", track.scrollLeft > 2);
  track.classList.toggle(
    "can-scroll-right",
    hasOverflow && track.scrollLeft < track.scrollWidth - track.clientWidth - 2,
  );
}

function initFilmstrip(): void {
  const track = getTrack();
  if (!track || track.dataset.railReady === "true") return;
  track.dataset.railReady = "true";

  track.addEventListener("scroll", syncFade, { passive: true });
  window.addEventListener("resize", syncFade, { passive: true });

  // Mouse/trackpad wheel scrolls the rail horizontally. Only intercept when
  // the gesture is predominantly vertical and the rail can actually scroll,
  // so page scrolling still works everywhere else.
  track.addEventListener(
    "wheel",
    (event) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const max = track.scrollWidth - track.clientWidth;
      if (max <= 0) return;
      event.preventDefault();
      track.scrollLeft += event.deltaY;
    },
    { passive: false },
  );

  syncFade();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initFilmstrip, { once: true });
} else {
  initFilmstrip();
}
