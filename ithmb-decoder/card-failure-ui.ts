import { addFailure } from "./cards.js";
import { addFilmstripThumb } from "./filmstrip.js";
import { t } from "./i18n.js";
import { createShareBox } from "./share-actions.js";
import { escapeHtml } from "./utils.js";
import { refreshViewerIfCurrent } from "./viewer.js";

export function renderFailureCard(
  cardId: string,
  file: File,
  bytes: Uint8Array,
  prefix: number,
  mode: "known-failed" | "unknown",
): void {
  // mode: "known-failed" | "unknown"
  const card = document.getElementById(cardId)!;
  const statusEl = card.querySelector<HTMLElement>(".status")!;
  const previewEl = card.querySelector<HTMLElement>(".preview")!;

  const isKnown = mode === "known-failed";

  statusEl.className = "status " + (isKnown ? "err" : "unknown");
  statusEl.textContent = isKnown ? t("card.decodeFailed") : t("card.unknownFormat", { prefix });
  previewEl.style.display = "block";
  previewEl.innerHTML = "";
  previewEl.appendChild(
    createShareBox({
      cardId,
      bytes,
      prefix,
      isKnown,
      fileSize: file.size,
    }),
  );

  addFailure({
    cardId,
    bytes,
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
  statusEl.className = "status err";
  statusEl.textContent = t("card.error");
  previewEl.style.display = "block";
  previewEl.innerHTML = `<div class="err-msg">${escapeHtml(errMsg)}</div>`;
  addFilmstripThumb(cardId);
  refreshViewerIfCurrent(cardId);
}
