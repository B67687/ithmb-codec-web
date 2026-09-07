import { S, KNOWN_PREFIXES } from "./state.js";
import { addSuccess, findSuccess, successCards, failedCards } from "./cards.js";
import { formatLabels, extMap, formatSize } from "./utils.js";
import { refreshViewerIfCurrent } from "./viewer.js";
import { addFilmstripThumb } from "./filmstrip.js";
import { get_encoding_name } from "./ithmb_wasm.js";
import { createShareBox } from "./share-actions.js";
import { createReportLink } from "./report-modal.js";
import { t } from "./i18n.js";

export function renderSuccessCard(
  cardId: string,
  file: File,
  canvas: HTMLCanvasElement,
  prefix: number,
  width: number,
  height: number,
  bytes: Uint8Array,
): void {
  const card = document.getElementById(cardId)!;
  const statusEl = card.querySelector<HTMLElement>(".status")!;
  const previewEl = card.querySelector<HTMLElement>(".preview")!;

  statusEl.className = "status ok";
  statusEl.textContent = t("card.decoded", { w: width, h: height });
  previewEl.style.display = "flex";

  // Constrain display size
  const maxW = 600,
    maxH = 400;
  let dispW = width,
    dispH = height;
  if (dispW > maxW) {
    dispH = (dispH * maxW) / dispW;
    dispW = maxW;
  }
  if (dispH > maxH) {
    dispW = (dispW * maxH) / dispH;
    dispH = maxH;
  }

  canvas.style.width = Math.round(dispW) + "px";
  canvas.style.height = Math.round(dispH) + "px";
  if (dispW > 350) previewEl.classList.add("stack-below");

  previewEl.innerHTML = "";
  previewEl.appendChild(canvas);

  // Track successful decode (before info panel so renderCardInfo finds it).
  addSuccess({
    cardId,
    canvas,
    fileName: file.name,
    bytes,
    prefix,
    fileSize: file.size,
    width,
    height,
  });

  renderCardInfo(cardId);

  // Filmstrip
  const fileList = document.getElementById("file-list")!;
  if (fileList.classList.contains("viewer-mode")) {
    addFilmstripThumb(cardId, canvas);
    // If the just-decoded card is the one being viewed, refresh the stage
    // (canvas + report link + header) via the same path the failure cards
    // use. One mechanism for "current card changed" — no separate
    // surgical-update code path.
    refreshViewerIfCurrent(cardId);
  }
}

// Idempotent info-panel builder. Reads the card's entry from
// the success-cards list (cards.js) and rebuilds ONLY the info panel (translated text,
// format selector, save button, report link) — replacing, never appending.
// Safe to call again on language switch; the side effects (push, filmstrip)
// live in renderSuccessCard and do NOT re-run.
export function renderCardInfo(cardId: string): void {
  const entry = findSuccess(cardId);
  if (!entry) return;
  const { width, height, canvas, bytes, prefix, fileSize } = entry;
  const card = document.getElementById(cardId);
  if (!card) return;
  const statusEl = card.querySelector<HTMLElement>(".status")!;
  const previewEl = card.querySelector<HTMLElement>(".preview")!;

  // Status re-translates.
  statusEl.textContent = t("card.decoded", { w: width, h: height });

  // Rebuild info panel — clear then re-append (replace, not append).
  const infoDiv = document.createElement("div");
  infoDiv.className = "info";
  infoDiv.innerHTML = `
    <div><span class="info-label">${t("card.formatPrefix")}</span> <span class="prefix-badge">${prefix}</span></div>
    <div data-info="dims"><span class="info-label">${t("card.dimensions")}</span> <span class="info-value">${width}×${height} px</span></div>
    <div data-info="enc"><span class="info-label">${t("card.encoding")}</span> <span class="info-value">${get_encoding_name(prefix)}</span></div>
    <div><span class="info-label">${t("card.fileSize")}</span> <span class="info-value">${formatSize(fileSize)}</span></div>
    <div class="actions" style="display:flex;align-items:center;gap:4px">
      <button class="btn btn-primary btn-small" data-save>${t("card.save", { fmt: formatLabels[S.cardFormats[cardId] || S.downloadFormat] || "JPEG" })}</button>
      <select class="fmt-select card-format-select" data-card="${cardId}" aria-label="${t("card.formatAria")}" style="height:28px;font-size:0.75rem;padding:2px 4px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text)">
        <option value="image/jpeg">JPEG</option>
        <option value="image/png">PNG</option>
        <option value="image/bmp">BMP</option>
        <option value="image/webp">WebP</option>
      </select>
    </div>
  `;

  // Remove any previous info panel + report link, then re-append fresh.
  // If the report form was OPEN, keep it open across the rebuild — a
  // language switch must not close a form the user is filling out.
  const oldInfo = previewEl.querySelector(".info");
  const oldReport = previewEl.querySelector(".success-report");
  // The report form lives in the SHARED modal (fixed overlay, independent
  // of card re-renders) — no open-state to preserve here.
  if (oldInfo) oldInfo.remove();
  if (oldReport) oldReport.remove();
  previewEl.appendChild(infoDiv);
  infoDiv.appendChild(createReportLink({ cardId, bytes, prefix, fileSize }));

  // Format selector (per-card override preserved via S.cardFormats[cardId]).
  const fmtSelect = infoDiv.querySelector<HTMLSelectElement>(".fmt-select");
  if (fmtSelect) {
    fmtSelect.value = S.cardFormats[cardId] || S.downloadFormat;
    fmtSelect.addEventListener("change", function (this: HTMLSelectElement) {
      S.cardFormats[cardId] = this.value;
      const saveBtn = this.parentElement!.querySelector("[data-save]");
      if (saveBtn)
        saveBtn.textContent = t("card.save", {
          fmt: formatLabels[this.value] || "JPEG",
        });
    });
  }

  // Save button.
  infoDiv.querySelector("[data-save]")!.addEventListener("click", () => {
    const link = document.createElement("a");
    const cardFormat = S.cardFormats[cardId] || S.downloadFormat;
    const ext = extMap[cardFormat] || ".jpg";
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        link.href = URL.createObjectURL(blob);
        link.download =
          (entry.fileName || "image").replace(/\.ithmb$/i, "") + ext;
        link.click();
        URL.revokeObjectURL(link.href);
      },
      cardFormat,
      0.95,
    );
  });
}

// Re-render ALL result cards in the current language. Called on language
// switch (setLang). Success cards rebuild their info panel via renderCardInfo;
// failure cards rebuild their share box; error cards have no persisted state
// and are left as-is (their message is not translatable).
export function reRenderCards(): void {
  for (const entry of successCards()) {
    renderCardInfo(entry.cardId);
  }
  for (const entry of failedCards()) {
    // Error cards must never be in the cards lists (they carry no shareable
    // bytes) — skip defensively so a bytes-less entry can't crash the whole
    // re-render via createShareBox's bytes.slice(0, 16).
    if (!entry.bytes) continue;
    const card = document.getElementById(entry.cardId);
    if (!card) continue;
    const previewEl = card.querySelector(".preview");
    if (!previewEl) continue;
    const isKnown = KNOWN_PREFIXES.has(entry.prefix);
    const statusEl = card.querySelector(".status");
    if (statusEl) {
      statusEl.textContent = isKnown
        ? t("card.decodeFailed")
        : t("card.unknownFormat", { prefix: entry.prefix });
    }
    const oldBox = previewEl.querySelector(".share-box");
    if (oldBox) oldBox.remove();
    previewEl.appendChild(
      createShareBox({
        cardId: entry.cardId,
        bytes: entry.bytes,
        prefix: entry.prefix,
        isKnown,
        fileSize: entry.fileSize,
      }),
    );
  }
}
