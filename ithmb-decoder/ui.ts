import { resetCards } from "./cards.js";
import { decodeFile } from "./decoder.js";
import { createFilmstripThumb } from "./filmstrip.js";
import { t } from "./i18n.js";
import { S, processedFileIds } from "./state.js";
import { bytesToHex, escapeHtml, formatSize, showToast } from "./utils.js";
import { openViewer, updateToolbar } from "./viewer.js";

const fileList = document.getElementById("file-list")!;

async function fileFingerprint(file: File): Promise<string> {
  const blob = file.slice(0, 256);
  const buf = await blob.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return bytesToHex(new Uint8Array(hash), "");
}

export function addFileCard(file: File): string {
  S.cardCount++;
  const cardId = "card-" + ++S.globalCardIdCounter;
  const card = document.createElement("div");
  card.className = "file-card";
  card.dataset.cardId = cardId;
  fileList.classList.add("viewer-mode");
  card.id = cardId;
  card.innerHTML = `
        <div class="meta">
          <span class="name">${escapeHtml(file.name)}</span>
          <span class="size">${formatSize(file.size)}</span>
        </div>
        <div class="status loading"><span class="spinner"></span> ${t("viewer.decoding")}</div>
        <div class="preview" style="display:none"></div>
      `;
  fileList.appendChild(card);
  createFilmstripThumb(cardId);
  return cardId;
}

export async function processFiles(files: File[]): Promise<void> {
  const isFirstBatch = fileList.children.length === 0;

  if (isFirstBatch) {
    // Full reset for first batch
    fileList.innerHTML = "";
    S.cardCount = 0;
    S.globalCardIdCounter = 0;
    S.totalFiles = 0;
    resetCards();

    processedFileIds.clear();
    const filmstrip = document.getElementById("viewer-filmstrip");
    if (filmstrip) filmstrip.innerHTML = "";
    const container = document.getElementById("viewer-container");
    if (container) container.style.display = "none";
  }

  const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8 MB

  // Dedup by content hash + filename (same name + same content = duplicate)
  const valid: File[] = [];
  let nonIthmb = 0;
  let tooLarge = 0;
  for (const f of files) {
    const n = f.name.toLowerCase();
    const isIthmb = n.endsWith(".ithmb") || n.endsWith(".ipm");
    if (!isIthmb) {
      nonIthmb++;
      continue;
    }
    if (f.size > MAX_FILE_SIZE) {
      tooLarge++;
      continue;
    }
    const fingerprint = await fileFingerprint(f);
    const key = n + "::" + fingerprint;
    if (processedFileIds.has(key)) continue;
    processedFileIds.add(key);
    valid.push(f);
  }

  if (nonIthmb > 0) showToast(t("ui.skipped", { n: nonIthmb }));
  if (tooLarge > 0) showToast(t("ui.tooLarge", { n: tooLarge }));

  S.totalFiles += valid.length;
  const cardCountBefore = [...fileList.querySelectorAll(".file-card")].length;
  // Decode in small waves and yield the event loop between waves. The wasm
  // decode_ithmb call is synchronous (blocks the main thread), so firing
  // every file at once renders all cards but the browser only paints once
  // at the end — images "flash in all at once". Batching + a macrotask yield
  // lets the browser paint each wave progressively as decodes complete.
  // (setTimeout, not requestAnimationFrame: rAF is paused in background tabs,
  // which stalled the whole decode loop if the user switched tabs.)
  const CONCURRENCY = 4;
  let viewerOpened = false;
  for (let i = 0; i < valid.length; i += CONCURRENCY) {
    const batch = valid.slice(i, i + CONCURRENCY);
    // Create cards synchronously (addFileCard is pure DOM, no wasm) so the
    // viewer opens at card-creation time — matching the original behavior
    // where openViewer fired on drop, before any decode completed.
    const cardIds = batch.map((file) => addFileCard(file));
    if (!viewerOpened) {
      openViewer(isFirstBatch ? 0 : cardCountBefore + i);
      viewerOpened = true;
    }
    await Promise.all(
      batch.map((file, j) => {
        const id = cardIds[j];
        if (id === undefined) return Promise.resolve();
        return decodeFile(file, id);
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  updateToolbar();
}
