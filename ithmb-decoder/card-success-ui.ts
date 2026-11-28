import { addSuccess, failedCards, findSuccess, successCards } from "./cards.js";
import { addFilmstripThumb } from "./filmstrip.js";
import { t } from "./i18n.js";
import { get_encoding_name } from "./ithmb_wasm.js";
import { type FrameInfo } from "./decode-pipeline.js";
import { PROFILES } from "./profiles.js";
import { S } from "./state.js";
import { saveCanvasAs } from "./download.js";
import { DEFAULT_FORMAT, OUTPUT_FORMATS, formatLabels, formatSize } from "./utils.js";
import { createFailureInfo, failureMode } from "./failure-info.js";
import { refreshViewerIfCurrent } from "./viewer.js";

/** Decode metadata the success card needs beyond pixels (B3 data integrity). */
export interface SuccessMeta {
  /** True when the image came from a JPEG stream (bare or carved): the prefix
   *  is not a codec profile, so the "Unknown format" label would be a lie. */
  jpeg: boolean;
  /** Set when a multi-frame container was clipped to frame 0. */
  frame: FrameInfo | null;
}

/**
 * Visible status line. A multi-frame container says which frame is painted, so
 * a clipped frame 0 is never mistaken for the whole file (MT-004/LB-06). The
 * frame count is "?" when the container is truncated and the total is unknown.
 */
function decodedStatus(width: number, height: number, frame: FrameInfo | null): string {
  return frame
    ? t("card.decodedFrame", { w: width, h: height, i: frame.index, n: frame.total ?? "?" })
    : t("card.decoded", { w: width, h: height });
}

export function renderSuccessCard(
  cardId: string,
  file: File,
  canvas: HTMLCanvasElement,
  prefix: number,
  width: number,
  height: number,
  meta: SuccessMeta,
): void {
  const card = document.getElementById(cardId)!;
  const statusEl = card.querySelector<HTMLElement>(".status")!;
  const previewEl = card.querySelector<HTMLElement>(".preview")!;

  statusEl.className = "status ok";
  statusEl.textContent = decodedStatus(width, height, meta.frame);
  previewEl.style.display = "flex";

  // The result thumbnail box owns the sizing (aspect-ratio 4/3, object-fit
  // cover) — no inline display size on the canvas, the stage and the card
  // scale the same bitmap differently through CSS.
  previewEl.innerHTML = "";
  previewEl.appendChild(canvas);

  // Track successful decode (before info panel so renderCardInfo finds it).
  addSuccess({
    cardId,
    canvas,
    fileName: file.name,
    prefix,
    fileSize: file.size,
    width,
    height,
    encoding: meta.jpeg ? t("card.encodingJpeg") : get_encoding_name(prefix),
    jpeg: meta.jpeg,
    frame: meta.frame,
  });

  renderCardInfo(cardId);

  // Filmstrip + viewer refresh. The viewer is always visible next to the
  // results grid now, so every completed decode fills its thumb and refreshes
  // the stage when it is the active card.
  addFilmstripThumb(cardId, canvas);
  refreshViewerIfCurrent(cardId);
}

// Idempotent info-panel builder. Reads the card's entry from
// the success-cards list (cards.js) and rebuilds ONLY the info panel
// (translated text, format selector, save button) — replacing,
// never appending. Safe to call again on language switch; the side effects
// (push, filmstrip) live in renderSuccessCard and do NOT re-run.
function renderCardInfo(cardId: string): void {
  const entry = findSuccess(cardId);
  if (!entry) return;
  const { width, height, canvas, prefix, fileSize, jpeg, frame } = entry;
  const card = document.getElementById(cardId);
  if (!card) return;
  const statusEl = card.querySelector<HTMLElement>(".status")!;
  // The action panel lives in the card body, under the thumbnail. Fall back
  // to the preview box for any legacy markup still present.
  const infoSlot =
    card.querySelector<HTMLElement>(".info-slot") || card.querySelector<HTMLElement>(".preview")!;

  // Status re-translates.
  statusEl.textContent = decodedStatus(width, height, frame);

  // A JPEG stream has no codec profile number, and a multi-frame container is
  // labelled with the frame that is actually shown (MT-004/F7). The encoding
  // label is derived here (not stored as translated text) so a re-render in
  // another language cannot keep a stale translation.
  const profileKnown = Object.hasOwn(PROFILES, prefix);
  const encodingLabel = jpeg ? t("card.encodingJpeg") : get_encoding_name(prefix);
  const frameRow = frame
    ? `<div data-info="frame"><span class="info-label">${t("card.frame")}</span> <span class="info-value">${frame.index} / ${frame.total ?? "?"}</span></div>`
    : "";

  // Rebuild info panel — clear then re-append (replace, not append).
  const infoDiv = document.createElement("div");
  infoDiv.className = "info";
  // Options follow the one format registry (order + labels), so the per-card
  // control can never disagree with the toolbar's segmented row.
  const formatOptions = OUTPUT_FORMATS.map(
    (format) => `<option value="${format.mime}">${format.label}</option>`,
  ).join("");
  infoDiv.innerHTML = `
    ${profileKnown ? `<div><span class="info-label">${t("card.formatPrefix")}</span> <span class="prefix-badge">${prefix}</span></div>` : ""}
    <div data-info="dims"><span class="info-label">${t("card.dimensions")}</span> <span class="info-value">${width} × ${height} px</span></div>
    <div data-info="enc"><span class="info-label">${t("card.encoding")}</span> <span class="info-value">${encodingLabel}</span></div>
    ${frameRow}
    <div><span class="info-label">${t("card.fileSize")}</span> <span class="info-value">${formatSize(fileSize)}</span></div>
    <div class="actions">
      <button class="btn btn-primary btn-small" data-save>${t("card.save", { fmt: formatLabels[S.cardFormats[cardId] || S.downloadFormat] || DEFAULT_FORMAT.label })}</button>
      <span class="actions-format">
        <span class="actions-label">${t("card.saveAs")}</span>
        <select class="fmt-select card-format-select" data-card="${cardId}" aria-label="${t("card.saveAs")}">
          ${formatOptions}
        </select>
      </span>
    </div>
  `;

  // Remove any previous info panel, then re-append fresh.
  const oldInfo = infoSlot.querySelector(".info");
  if (oldInfo) oldInfo.remove();
  infoSlot.appendChild(infoDiv);

  // Format selector (per-card override preserved via S.cardFormats[cardId]).
  const fmtSelect = infoDiv.querySelector<HTMLSelectElement>(".fmt-select");
  if (fmtSelect) {
    fmtSelect.value = S.cardFormats[cardId] || S.downloadFormat;
    fmtSelect.addEventListener("change", function (this: HTMLSelectElement) {
      S.cardFormats[cardId] = this.value;
      const saveBtn = this.closest(".actions")?.querySelector("[data-save]");
      if (saveBtn)
        saveBtn.textContent = t("card.save", {
          fmt: formatLabels[this.value] || DEFAULT_FORMAT.label,
        });
    });
  }

  // Save button: same validated encoder as the ZIP (real BMP + magic check).
  infoDiv.querySelector("[data-save]")!.addEventListener("click", () => {
    const cardFormat = S.cardFormats[cardId] || S.downloadFormat;
    void saveCanvasAs(canvas, entry.fileName || "image", cardFormat);
  });
}

// The toolbar segmented control is the ZIP default; when it changes, every
// card's "Save as" select follows so the two controls never disagree (F04).
export function applyGlobalFormatToCards(): void {
  for (const entry of successCards()) {
    S.cardFormats[entry.cardId] = S.downloadFormat;
    const card = document.getElementById(entry.cardId);
    if (!card) continue;
    const select = card.querySelector<HTMLSelectElement>(".fmt-select");
    if (select) select.value = S.downloadFormat;
    const saveBtn = card.querySelector<HTMLElement>("[data-save]");
    if (saveBtn) {
      saveBtn.textContent = t("card.save", {
        fmt: formatLabels[S.downloadFormat] || DEFAULT_FORMAT.label,
      });
    }
  }
}

// Re-render ALL result cards in the current language. Called on language
// switch (setLang). Success cards rebuild their info panel via renderCardInfo;
// failure cards rebuild their why line and next steps; error cards have no persisted state
// and are left as-is (their message is not translatable).
export function reRenderCards(): void {
  for (const entry of successCards()) {
    renderCardInfo(entry.cardId);
  }
  for (const entry of failedCards()) {
    // Error cards must never be in the cards lists (they carry no decoded image
    // bytes) — skip defensively so a bytes-less entry can't crash the whole
    // re-render while a bytes-less entry exists.
    if (!entry.bytes) continue;
    const card = document.getElementById(entry.cardId);
    if (!card) continue;
    const infoSlot = card.querySelector(".info-slot");
    if (!infoSlot) continue;
    // Prefer the classification stored with the failure; re-derive only when a
    // legacy entry has none (keeps a database card a database card).
    const mode = entry.mode ?? failureMode(entry.bytes, entry.prefix);
    const statusEl = card.querySelector(".status");
    if (statusEl) {
      statusEl.textContent =
        mode === "database"
          ? t("card.database")
          : mode === "damaged"
            ? entry.bytes.length === 0
              ? t("card.fileEmpty")
              : t("card.fileDamaged")
            : t("card.unknownFormat", { prefix: entry.prefix });
    }
    // The compact why line + next steps live in the card body (the detailed
    // card is rebuilt by the viewer when the card is being viewed).
    const oldBox = infoSlot.querySelector(".failure-info");
    if (oldBox) oldBox.remove();
    infoSlot.appendChild(
      createFailureInfo(
        {
          cardId: entry.cardId,
          bytes: entry.bytes,
          prefix: entry.prefix,
          fileSize: entry.fileSize,
          mode,
        },
        "card",
      ),
    );
  }
}
