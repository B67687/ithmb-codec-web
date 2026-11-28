import { resetCards, successCount } from "./cards.js";
import { decodeFile } from "./decoder.js";
import { createFilmstripThumb } from "./filmstrip.js";
import { fileFingerprint } from "./file-digest.js";
import { t } from "./i18n.js";
import { LIMIT_VALUES, LIMITS, admitSessionFile, resetSession } from "./limits.js";
import { S, processedFileIds } from "./state.js";
import { escapeHtml, showToast } from "./utils.js";
import { openViewer, updateToolbar } from "./viewer.js";

const fileList = document.getElementById("file-list")!;

// Polite live-region announcement (top-level #liveStatus, role=status).
function announce(message: string): void {
  const el = document.getElementById("liveStatus");
  if (!el) return;
  el.textContent = "";
  window.setTimeout(() => {
    el.textContent = message;
  }, 50);
}

// Dedupe by content hash + filename (same name + same content = duplicate),
// then apply per-session caps across every Add-file batch (F01). The
// fingerprint covers the WHOLE file (fingerprint.ts) — hashing only the first
// 256 bytes silently dropped genuinely different files (MT-017).
//
// One result card. Markup mirrors the design-lab reference card: thumbnail
// first, then a compact body (name / decoded line / save action). The info
// panel the decoder fills in later lives in `.info-slot` so it never sits on
// top of the thumbnail.
function addFileCard(file: File): string {
  S.cardCount++;
  const cardId = "card-" + ++S.globalCardIdCounter;
  const card = document.createElement("article");
  card.className = "file-card";
  card.dataset.cardId = cardId;
  card.id = cardId;
  card.tabIndex = -1;
  card.setAttribute("role", "group");
  card.setAttribute("aria-roledescription", t("viewer.cardRole"));
  card.setAttribute("aria-label", file.name + " — " + t("viewer.openHint"));
  card.innerHTML = `
        <div class="preview" style="display:none"></div>
        <div class="result__body">
          <b class="name">${escapeHtml(file.name)}</b>
          <div class="status loading"><span class="spinner"></span> ${t("viewer.decoding")}</div>
          <div class="info-slot"></div>
        </div>
      `;
  fileList.appendChild(card);
  // Roving tabindex: the first card is the single grid tab stop.
  if (S.cardCount === 1) card.tabIndex = 0;
  createFilmstripThumb(cardId);
  return cardId;
}

export interface BatchSkips {
  unsupported: number;
  tooLarge: number;
  duplicates: number;
  fileCap: number;
  byteCap: number;
  folders: number;
  accepted: number;
}

export const emptySkips = (): BatchSkips => ({
  unsupported: 0,
  tooLarge: 0,
  duplicates: 0,
  fileCap: 0,
  byteCap: 0,
  folders: 0,
  accepted: 0,
});

// One persistent summary for every skip reason instead of stacked toasts
// (edge-audit F08). It stays until dismissed and is announced in the live region.
export function showBatchSummary(skips: BatchSkips): boolean {
  const totalSkipped =
    skips.unsupported +
    skips.tooLarge +
    skips.duplicates +
    skips.fileCap +
    skips.byteCap +
    skips.folders;
  if (totalSkipped === 0) return false;
  const notice = document.getElementById("batchNotice");
  const parts: string[] = [];
  if (skips.accepted > 0) parts.push(t("ui.summaryAccepted", { n: skips.accepted }));
  if (skips.unsupported > 0) parts.push(t("ui.summaryUnsupported", { n: skips.unsupported }));
  if (skips.tooLarge > 0)
    parts.push(t("ui.summaryTooLarge", { n: skips.tooLarge, mb: LIMIT_VALUES.fileMb }));
  if (skips.duplicates > 0) parts.push(t("ui.summaryDuplicates", { n: skips.duplicates }));
  if (skips.fileCap > 0)
    parts.push(t("ui.summaryFileCap", { n: skips.fileCap, max: LIMIT_VALUES.sessionFiles }));
  if (skips.byteCap > 0)
    parts.push(t("ui.summaryByteCap", { n: skips.byteCap, mb: LIMIT_VALUES.sessionMb }));
  if (skips.folders > 0) parts.push(t("ui.summaryFolders", { n: skips.folders }));
  const text = parts.join(" · ");
  if (notice) {
    const body = notice.querySelector(".batch-notice__text");
    if (body) body.textContent = text;
    notice.hidden = false;
    notice.dataset.reasons = JSON.stringify(skips);
  }
  // Keep the legacy toast for a single-reason folder drop before the loaded
  // shell exists; everything else is in the persistent summary.
  if (!notice) showToast(text);
  announce(t("ui.summaryLive", { text }));
  return true;
}

export function dismissBatchSummary(): void {
  const notice = document.getElementById("batchNotice");
  if (notice) notice.hidden = true;
}

export async function processFiles(files: File[]): Promise<void> {
  const isFirstBatch = fileList.children.length === 0;

  if (isFirstBatch) {
    // Full reset for the first batch of the session.
    fileList.innerHTML = "";
    S.cardCount = 0;
    S.globalCardIdCounter = 0;
    S.totalFiles = 0;
    resetCards();
    resetSession();
    processedFileIds.clear();
    const filmstrip = document.getElementById("viewer-filmstrip");
    if (filmstrip) {
      for (const thumb of filmstrip.querySelectorAll(".filmstrip-thumb")) thumb.remove();
    }
    const pos = document.getElementById("viewerPos");
    if (pos) pos.textContent = "0 / 0";
    S.viewerIndex = -1;
  }

  // Dedup by content hash + filename (same name + same content = duplicate),
  // then apply per-session caps across every Add-file batch (F01).
  const valid: File[] = [];
  const skips = emptySkips();
  for (const f of files) {
    const n = f.name.toLowerCase();
    const isIthmb = n.endsWith(".ithmb") || n.endsWith(".ipm");
    if (!isIthmb) {
      skips.unsupported++;
      continue;
    }
    if (f.size > LIMITS.FILE_BYTES) {
      skips.tooLarge++;
      continue;
    }
    // Dedupe on the full-content fingerprint (MT-017). A File object the
    // browser cannot read must not abort the whole batch (WebKit on some
    // Windows builds intermittently fails File reads): skip dedupe for that
    // file and let the decoder's error path report it per card.
    let fingerprint: string;
    try {
      fingerprint = await fileFingerprint(f);
    } catch {
      fingerprint = "unreadable-" + Math.random().toString(36).slice(2);
    }
    const key = n + "::" + fingerprint;
    if (processedFileIds.has(key)) {
      skips.duplicates++;
      continue;
    }
    processedFileIds.add(key);
    const admitted = admitSessionFile(f.size);
    if (!admitted.ok) {
      skips[admitted.reason === "fileCap" ? "fileCap" : "byteCap"]++;
      continue;
    }
    valid.push(f);
  }
  skips.accepted = valid.length;
  showBatchSummary(skips);

  S.totalFiles += valid.length;
  S.pendingDecodes += valid.length;
  const successBefore = successCount();
  if (valid.length > 0) announce(t("decoder.liveDecoding", { n: valid.length }));
  const cardCountBefore = [...fileList.querySelectorAll(".file-card")].length;
  const CONCURRENCY = 4;
  let viewerOpened = false;
  for (let i = 0; i < valid.length; i += CONCURRENCY) {
    const batch = valid.slice(i, i + CONCURRENCY);
    const cardIds = batch.map((file) => addFileCard(file));
    if (!viewerOpened) {
      openViewer(isFirstBatch ? 0 : cardCountBefore + i);
      viewerOpened = true;
    }
    await Promise.all(
      batch.map((file, j) => {
        const id = cardIds[j];
        if (id === undefined) return Promise.resolve();
        return decodeFile(file, id).finally(() => {
          S.pendingDecodes = Math.max(0, S.pendingDecodes - 1);
          updateToolbar();
        });
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  updateToolbar();

  if (valid.length > 0) {
    const images = successCount() - successBefore;
    const failed = valid.length - images;
    announce(
      failed > 0
        ? t("decoder.liveDoneMixed", { n: images, f: failed })
        : t("decoder.liveDone", { n: images }),
    );
    if (isFirstBatch) {
      const title = document.getElementById("loadedTitle");
      // Never steal focus while a modal dialog is open (edge-audit F19).
      if (title && !document.body.classList.contains("modal-open")) {
        title.focus({ preventScroll: true });
      }
    }
  }
}
