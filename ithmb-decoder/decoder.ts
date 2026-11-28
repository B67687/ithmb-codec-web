import { renderErrorCard, renderFailureCard } from "./card-failure-ui.js";
import { renderSuccessCard } from "./card-success-ui.js";
import { classifyFailure, parsePixelHeader, planDecode } from "./decode-pipeline.js";
import { t } from "./i18n.js";
import { decode_ithmb } from "./ithmb_wasm.js";
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
    // Pure decision first (decode-pipeline.ts): database containers, unknown
    // prefixes the codec would size-heuristic into a fake success (MT-003), and
    // multi-frame payloads that need clipping to frame 0 (MT-004) are settled
    // before any bytes reach the WASM decoder.
    const plan = planDecode(bytes);
    prefix = plan.prefix;
    if (plan.action === "reject") {
      renderFailureCard(cardId, file, bytes, prefix, plan.mode);
      updateToolbar();
      return;
    }

    const result = decode_ithmb(plan.input);

    if (result) {
      // Success!
      const { width, height, pixels } = parsePixelHeader(result);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      // Programmatic name for the decoded bitmap (A11Y-16).
      canvas.setAttribute("role", "img");
      canvas.setAttribute(
        "aria-label",
        t("viewer.cardImageLabel", { name: file.name, w: width, h: height }),
      );
      const ctx = canvas.getContext("2d")!;
      const imageData = ctx.createImageData(width, height);
      imageData.data.set(pixels);
      ctx.putImageData(imageData, 0, 0);

      renderSuccessCard(cardId, file, canvas, prefix, width, height, {
        jpeg: plan.jpeg,
        frame: plan.frame,
      });
    } else {
      // Decode failed
      renderFailureCard(cardId, file, bytes, prefix, classifyFailure(bytes, prefix));
    }
  } catch (err) {
    const message = (err instanceof Error && err.message) || String(err);
    // W3 wasm boundary: a throw AFTER bytes/prefix were captured (wasm panic,
    // OOM, malformed pixel header) is still a decodable-format failure the
    // user can help with — render the failure info card, not a dead-end error.
    // Only pre-bytes failures (empty input, unreadable file) stay error cards.
    console.error("[wasm] decode threw", { prefix, message });
    if (bytes !== undefined && prefix !== undefined) {
      renderFailureCard(cardId, file, bytes, prefix, classifyFailure(bytes, prefix));
    } else {
      card.classList.add("is-error");
      statusEl.className = "status err";
      statusEl.textContent = t("card.error");
      previewEl.style.display = "block";
      previewEl.innerHTML = `<div class="err-msg">${escapeHtml(message)}</div>`;
      // Error cards are NOT stored in the cards lists: they carry no decoded image
      // bytes (the failure may have happened before bytes/prefix were set), so
      // a failed entry would break reRenderCards (createShareBox throws
      // on undefined bytes) and mislabel the card as an unknown format. The
      // viewer already treats error cards as entries without a failed entry.
      renderErrorCard(cardId, message);
    }
  }
  updateToolbar();
}
