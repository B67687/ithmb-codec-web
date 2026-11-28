import { addFailure } from "./cards.js";
import { LIMITS } from "./limits.js";
import { addFilmstripThumb } from "./filmstrip.js";
import { createFailureInfo } from "./failure-info.js";
import { t } from "./i18n.js";
import { escapeHtml } from "./utils.js";
import { refreshViewerIfCurrent } from "./viewer.js";

// One visual language for every failed decode surface:
//  - result card preview: muted dark tile with a small amber corner badge and
//    a faint "no image" glyph (scaled-up sibling of the filmstrip thumbnail);
//  - result card body: filename + status + why line + next steps;
//  - viewer band: the detailed failure card.
const FAIL_THUMB = `
  <div class="fail-thumb" aria-hidden="true">
    <svg class="fail-thumb__glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <path d="m3.6 16.4 4.9-5.1 3.7 3.7 2.6-2.3 5.6 5.5" />
      <path d="M8 9.2h.01" />
    </svg>
  </div>`;

export function renderFailureCard(
  cardId: string,
  file: File,
  bytes: Uint8Array,
  prefix: number,
  mode: "damaged" | "unknown" | "database",
): void {
  const card = document.getElementById(cardId)!;
  const statusEl = card.querySelector<HTMLElement>(".status")!;
  const previewEl = card.querySelector<HTMLElement>(".preview")!;
  const infoSlot = card.querySelector<HTMLElement>(".info-slot")!;

  card.classList.add("is-failure");
  statusEl.className =
    "status " + (mode === "damaged" ? "err" : mode === "database" ? "unknown" : "unknown");
  statusEl.textContent =
    mode === "database"
      ? t("card.database")
      : mode === "damaged"
        ? bytes.length === 0
          ? t("card.fileEmpty")
          : t("card.fileDamaged")
        : t("card.unknownFormat", { prefix });

  // The preview keeps the decoded cards' 4/3 thumbnail rhythm; the failed
  // tile is the card-level sibling of the filmstrip's failed thumbnail.
  previewEl.style.display = "block";
  previewEl.innerHTML = FAIL_THUMB;

  // Compact why-line + next steps; the detailed card lives in the viewer.
  infoSlot.innerHTML = "";
  infoSlot.appendChild(
    createFailureInfo({ cardId, bytes, prefix, fileSize: file.size, mode }, "card"),
  );

  addFailure({
    cardId,
    bytes: bytes.slice(0, LIMITS.FAILURE_BYTES),
    mode,
    prefix,
    fileName: file.name,
    fileSize: file.size,
  });

  // Filmstrip + viewer refresh
  addFilmstripThumb(cardId);
  refreshViewerIfCurrent(cardId);
}

export function renderErrorCard(cardId: string, errMsg: string): void {
  const card = document.getElementById(cardId)!;
  const statusEl = card.querySelector<HTMLElement>(".status")!;
  const previewEl = card.querySelector<HTMLElement>(".preview")!;
  const infoSlot = card.querySelector<HTMLElement>(".info-slot")!;
  card.classList.add("is-error");
  statusEl.className = "status err";
  statusEl.textContent = t("card.error");
  previewEl.style.display = "block";
  previewEl.innerHTML = FAIL_THUMB;
  infoSlot.innerHTML = `<div class="err-msg">${escapeHtml(errMsg)}</div>`;
  addFilmstripThumb(cardId);
  refreshViewerIfCurrent(cardId);
}
