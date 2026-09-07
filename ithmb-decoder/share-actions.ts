import { t } from "./i18n.js";
import { sharedSubmissionIds } from "./state.js";
import { submitTelemetry } from "./telemetry.js";
import { bytesToBase64, bytesToHex, showToast } from "./utils.js";

// Full-file shares are capped at the app's own decode limit (ui.js
// MAX_FILE_SIZE: files > 8 MB are rejected before decoding, so any file you
// can decode you can share fully). Keep in sync with the worker's
// MAX_BODY_BYTES (13 MB) and FULL_FILE_B64_MAX (~10.7 MB base64).
export const FULL_FILE_MAX_BYTES = 8 * 1024 * 1024;

export const SHARED_TEXT = (): string => t("share.shared");

interface ShareBoxParams {
  cardId: string;
  bytes: Uint8Array;
  prefix: number;
  isKnown: boolean;
  fileSize: number;
}

// Build the failure share box ("Share 16 bytes" / "Share full file").
// Used by the failure card AND the viewer stage so both surfaces share the
// exact same dedup keys and honest-failure semantics (one share per file;
// header share keeps full available; full share disables both).
export function createShareBox({
  cardId,
  bytes,
  prefix,
  isKnown,
  fileSize,
}: ShareBoxParams): HTMLDivElement {
  const box = document.createElement("div");
  box.className = "share-box";
  // Stable selector for re-finding the box after a re-render (the rollback
  // path re-queries via [data-card] because the captured buttons can go
  // stale when a language switch replaces the box mid-POST).
  box.dataset.card = cardId;
  const heading = t("share.helpImprove");
  const text = isKnown ? t("share.knownText") : t("share.unknownText");
  box.innerHTML = `
    <h4 class="share-heading">${heading}</h4>
    <p class="share-text">${text}</p>
    <div class="share-hexdump"><code>${bytesToHex(bytes.slice(0, 16))}</code></div>
    <div class="share-actions">
      <button class="btn btn-small btn-outline" data-share="header">${t("share.share16")}</button>
      <button class="btn btn-small btn-outline" data-share="full">${t("share.shareFull")}</button>
    </div>
  `;

  const headerBtn = box.querySelector<HTMLButtonElement>('[data-share="header"]')!;
  const fullBtn = box.querySelector<HTMLButtonElement>('[data-share="full"]')!;
  if (bytes.length > FULL_FILE_MAX_BYTES) fullBtn.style.display = "none";

  const setId = (isKnown ? "fail-" : "unknown-") + cardId;
  const headerKey = setId + "-h";
  const fullKey = setId + "-f";

  // Reflect a share already made from the other surface (card ↔ viewer).
  if (sharedSubmissionIds.has(fullKey)) {
    headerBtn.disabled = true;
    headerBtn.title = t("share.fullSharedTitle");
    fullBtn.textContent = SHARED_TEXT();
    fullBtn.disabled = true;
  } else if (sharedSubmissionIds.has(headerKey)) {
    headerBtn.textContent = SHARED_TEXT();
    headerBtn.disabled = true;
  }

  const share = async (fullFile: boolean): Promise<void> => {
    const key = fullFile ? fullKey : headerKey;
    if (sharedSubmissionIds.has(key)) return;
    // Mark synchronously so a fast second click cannot double-submit
    // while the POST is in flight.
    sharedSubmissionIds.add(key);
    const data: {
      prefix: number;
      fileSize: number;
      status: string;
      header: string;
      full_file?: string;
    } = {
      prefix,
      fileSize,
      status: isKnown ? "known-failed" : "unknown",
      header: bytesToHex(bytes.slice(0, 16), ""),
    };
    if (fullFile) data.full_file = bytesToBase64(bytes);
    // Optimistic update: flip the buttons immediately, fire the POST in the
    // background. The worker round-trip (~600ms cold start) would otherwise
    // make the click feel unresponsive.
    if (fullFile) {
      headerBtn.disabled = true;
      headerBtn.title = t("share.fullSharedTitle");
      fullBtn.textContent = SHARED_TEXT();
      fullBtn.disabled = true;
    } else {
      headerBtn.textContent = SHARED_TEXT();
      headerBtn.disabled = true;
    }
    showToast(fullFile ? t("share.fullSharedToast") : t("share.headerSharedToast"));
    submitTelemetry(data).then((ok) => {
      if (!ok) {
        // Server rejected the share — roll back so the user can retry, and
        // tell the truth instead of pretending it worked.
        sharedSubmissionIds.delete(key);
        // Re-query the buttons from the live DOM instead of mutating the
        // captured nodes: a language-switch re-render may have replaced this
        // share box while the POST was in flight, leaving the captured
        // buttons detached (a rollback on stale refs would strand the UI at
        // "Shared ✓" with no way to retry). Reset EVERY box carrying this
        // card's data-card — the card and the viewer stage render one share
        // box each for the same cardId (same pattern as the data-report
        // rollback). If no box exists, just release the dedup key — the
        // replacement box already reflects the unshared state.
        const liveBoxes = document.querySelectorAll<HTMLElement>(
          `.share-box[data-card="${cardId}"]`,
        );
        for (const liveBox of liveBoxes) {
          const liveHeader = liveBox.querySelector<HTMLButtonElement>('[data-share="header"]');
          const liveFull = liveBox.querySelector<HTMLButtonElement>('[data-share="full"]');
          if (fullFile) {
            if (liveHeader) {
              liveHeader.disabled = false;
              liveHeader.title = "";
            }
            if (liveFull) {
              liveFull.textContent = t("share.shareFull");
              liveFull.disabled = false;
            }
          } else if (liveHeader) {
            liveHeader.textContent = t("share.share16");
            liveHeader.disabled = false;
          }
        }
        showToast(t("share.failedToast"));
      }
    });
  };
  headerBtn.addEventListener("click", () => share(false));
  fullBtn.addEventListener("click", () => share(true));

  return box;
}
