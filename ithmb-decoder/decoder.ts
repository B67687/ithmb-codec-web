import { renderErrorCard, renderFailureCard } from "./card-failure-ui.js";
import { renderSuccessCard } from "./card-success-ui.js";
import { classifyResult, parsePixelHeader } from "./decode-pipeline.js";
import { t } from "./i18n.js";
import { decode_ithmb, peek_prefix } from "./ithmb_wasm.js";
import { escapeHtml } from "./utils.js";
import { updateToolbar } from "./viewer.js";

export async function decodeFile(file: File, cardId: string): Promise<void> {
  const card = document.getElementById(cardId)!;
  const statusEl = card.querySelector<HTMLElement>(".status")!;
  const previewEl = card.querySelector<HTMLElement>(".preview")!;
  let bytes: Uint8Array | undefined;
  let prefix: number | undefined;

  try {
    const buf = await file.arrayBuffer();
    bytes = new Uint8Array(buf);
    prefix = peek_prefix(bytes);
    const result = decode_ithmb(bytes);

    if (result) {
      // Success!
      const { width, height, pixels } = parsePixelHeader(result);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      const imageData = ctx.createImageData(width, height);
      imageData.data.set(pixels);
      ctx.putImageData(imageData, 0, 0);

      renderSuccessCard(cardId, file, canvas, prefix, width, height, bytes);
    } else {
      // Decode failed
      renderFailureCard(cardId, file, bytes, prefix, classifyResult(prefix, result));
    }
  } catch (err) {
    const message = (err instanceof Error && err.message) || String(err);
    // W3 wasm boundary: a throw AFTER bytes/prefix were captured (wasm panic,
    // OOM, malformed pixel header) is still a decodable-format failure the
    // user can help with — render the share card, not a dead-end error.
    // Only pre-bytes failures (empty input, unreadable file) stay error cards.
    console.error("[wasm] decode threw", { prefix, message });
    if (bytes !== undefined && prefix !== undefined) {
      renderFailureCard(cardId, file, bytes, prefix, classifyResult(prefix, null));
    } else {
      statusEl.className = "status err";
      statusEl.textContent = t("card.error");
      previewEl.style.display = "block";
      previewEl.innerHTML = `<div class="err-msg">${escapeHtml(message)}</div>`;
      // Error cards are NOT stored in the cards lists: they carry no shareable
      // bytes (the failure may have happened before bytes/prefix were set), so
      // a failed entry would break reRenderCards (createShareBox throws
      // on undefined bytes) and mislabel the card as an unknown format. The
      // viewer already treats error cards as entries without a failed entry.
      renderErrorCard(cardId, message);
    }
  }
  updateToolbar();
}
