import { S } from "./state.js";
import { openViewer } from "./viewer.js";

// Create a placeholder thumb in FILE order when a card is created. The
// thumbnail image is filled in later by addFilmstripThumb() once decode
// completes. Keeping the thumbs in file order means the filmstrip, the
// arrow navigation, and the "N / M" viewer numbering all share ONE order.
export function createFilmstripThumb(cardId: string): void {
  const filmstrip = document.getElementById("viewer-filmstrip");
  if (!filmstrip) return;
  if (filmstrip.querySelector(`[data-filmstrip-card="${cardId}"]`)) return;

  const thumb = document.createElement("div");
  thumb.className = "filmstrip-thumb pending";
  thumb.dataset.filmstripIndex = String(filmstrip.children.length);
  thumb.dataset.filmstripCard = cardId;

  thumb.addEventListener("click", () => {
    const allCards = document.querySelectorAll<HTMLElement>(".file-card");
    const target = Array.from(allCards).find((c) => c.dataset.cardId === cardId);
    const idx = target ? Array.from(allCards).indexOf(target) : 0;
    openViewer(idx);
  });

  filmstrip.appendChild(thumb);
}

// Fill an existing placeholder thumb with the decoded thumbnail (or the
// failure icon). Falls back to creating the thumb if no placeholder exists.
export function addFilmstripThumb(cardId: string, canvas?: HTMLCanvasElement): void {
  const filmstrip = document.getElementById("viewer-filmstrip");
  if (!filmstrip) return;
  let thumb = filmstrip.querySelector<HTMLElement>(`[data-filmstrip-card="${cardId}"]`);
  if (!thumb) {
    createFilmstripThumb(cardId);
    thumb = filmstrip.querySelector<HTMLElement>(`[data-filmstrip-card="${cardId}"]`);
    if (!thumb) return;
  }

  thumb.classList.remove("pending");
  thumb.classList.toggle("failed", !canvas);
  thumb.innerHTML = "";

  if (canvas) {
    const isMobile = window.innerWidth <= 480;
    const thumbW = isMobile ? 48 : 80;
    const thumbH = isMobile ? 36 : 60;
    const thumbCanvas = document.createElement("canvas");
    thumbCanvas.width = thumbW;
    thumbCanvas.height = thumbH;
    const tc = thumbCanvas.getContext("2d")!;
    tc.drawImage(canvas, 0, 0, thumbW, thumbH);
    thumb.appendChild(thumbCanvas);
  } else {
    thumb.innerHTML =
      '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;opacity:0.4"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" fill-rule="evenodd"/></svg></div>';
  }

  // Ensure active thumb highlight if this thumb matches current viewer card
  if (S.viewerIndex >= 0) {
    const allCards = document.querySelectorAll<HTMLElement>(".file-card");
    const currentCard = allCards[S.viewerIndex];
    if (currentCard && thumb.dataset.filmstripCard === currentCard.dataset.cardId) {
      thumb.classList.add("active");
    }
  }
}
