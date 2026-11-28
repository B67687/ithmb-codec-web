import { findFailure, successCards, successCount } from "./cards.js";
import { t } from "./i18n.js";
import { createFailureInfo, failureMode } from "./failure-info.js";
import { S } from "./state.js";
import { DEFAULT_FORMAT, escapeHtml, formatLabels } from "./utils.js";

const fileList = document.getElementById("file-list")!;

// ─────────────────────────── ambient viewer light ──────────────────────────
// Sample the current image locally into three CSS custom properties so the
// viewer band can glow with the image's own colours (YouTube-style ambient
// light). Runs once per image change, never on scroll/resize; no storage and
// no network. Tiny 28×28 read, else neutral fallback.
const AMBIENT_SIZE = 28;
let ambientSampleCount = 0;
let ambientCanvas: HTMLCanvasElement | null = null;
let ambientCtx: CanvasRenderingContext2D | null = null;

function clearAmbient(container: HTMLElement): void {
  container.dataset.ambient = "neutral";
  container.style.setProperty("--ambient-1", "transparent");
  container.style.setProperty("--ambient-2", "transparent");
  container.style.setProperty("--ambient-3", "transparent");
}

function applyAmbient(source: HTMLCanvasElement | null): void {
  const container = document.getElementById("viewer-container");
  if (!container) return;
  ambientSampleCount++;
  container.dataset.ambientSamples = String(ambientSampleCount);
  const started = performance.now();

  if (!source || !source.width || !source.height) {
    clearAmbient(container);
    container.dataset.ambientMs = (performance.now() - started).toFixed(2);
    return;
  }

  if (!ambientCanvas) {
    ambientCanvas = document.createElement("canvas");
    ambientCanvas.width = AMBIENT_SIZE;
    ambientCanvas.height = AMBIENT_SIZE;
    ambientCtx = ambientCanvas.getContext("2d", { willReadFrequently: true });
  }
  const ctx = ambientCtx;
  if (!ctx) {
    clearAmbient(container);
    return;
  }
  ctx.drawImage(source, 0, 0, AMBIENT_SIZE, AMBIENT_SIZE);
  const { data } = ctx.getImageData(0, 0, AMBIENT_SIZE, AMBIENT_SIZE);

  // Overall average plus a 2×2 quadrant palette.
  const quad = [
    { r: 0, g: 0, b: 0, n: 0 },
    { r: 0, g: 0, b: 0, n: 0 },
    { r: 0, g: 0, b: 0, n: 0 },
    { r: 0, g: 0, b: 0, n: 0 },
  ];
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const half = AMBIENT_SIZE / 2;
  // Edge strips drive the halo placement: left/right/top colours in the image
  // become the glow just outside those image edges.
  const edge = {
    left: { r: 0, g: 0, b: 0, n: 0 },
    right: { r: 0, g: 0, b: 0, n: 0 },
    top: { r: 0, g: 0, b: 0, n: 0 },
  };
  const edgeCut = Math.max(2, Math.round(AMBIENT_SIZE * 0.22));
  for (let y = 0; y < AMBIENT_SIZE; y++) {
    for (let x = 0; x < AMBIENT_SIZE; x++) {
      const i = (y * AMBIENT_SIZE + x) * 4;
      const alpha = data[i + 3] ?? 255;
      if (alpha === 0) continue;
      const pr = data[i] ?? 0;
      const pg = data[i + 1] ?? 0;
      const pb = data[i + 2] ?? 0;
      r += pr;
      g += pg;
      b += pb;
      n++;
      const q = (y < half ? 0 : 2) + (x < half ? 0 : 1);
      const bucket = quad[q]!;
      bucket.r += pr;
      bucket.g += pg;
      bucket.b += pb;
      bucket.n++;
      const strip =
        x < edgeCut
          ? edge.left
          : x >= AMBIENT_SIZE - edgeCut
            ? edge.right
            : y < edgeCut
              ? edge.top
              : null;
      if (strip) {
        strip.r += pr;
        strip.g += pg;
        strip.b += pb;
        strip.n++;
      }
    }
  }
  if (n === 0) {
    clearAmbient(container);
    return;
  }
  const avg = { r: r / n, g: g / n, b: b / n };
  const lum = (0.2126 * avg.r + 0.7152 * avg.g + 0.0722 * avg.b) / 255;
  const chromaOf = (c: { r: number; g: number; b: number }): number =>
    (Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)) / 255;
  const toColor = (c: { r: number; g: number; b: number; n: number }) => ({
    r: c.r / c.n,
    g: c.g / c.n,
    b: c.b / c.n,
  });
  const edges = [edge.left, edge.right, edge.top].filter((e) => e.n > 0).map(toColor);
  const chromaOfColor = chromaOf;
  const colorful = edges.filter(
    (c) => chromaOfColor(c) >= 0.045 && (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255 > 0.05,
  );
  // Near-black, near-white or colourless images use the neutral band glow.
  if (lum < 0.05 || lum > 0.95 || colorful.length === 0) {
    clearAmbient(container);
    container.dataset.ambientMs = (performance.now() - started).toFixed(2);
    return;
  }
  const palette = edges
    .map((c) => ({
      color: c,
      chroma: chromaOfColor(c),
      lum: (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255,
    }))
    .filter((c) => c.lum > 0.05 && c.lum < 0.95 && c.chroma >= 0.02)
    .sort((a, b2) => b2.chroma - a.chroma)
    .slice(0, 3)
    .map((c) => c.color);
  if (palette.length === 0) {
    clearAmbient(container);
    container.dataset.ambientMs = (performance.now() - started).toFixed(2);
    return;
  }
  while (palette.length < 3) palette.push(palette[palette.length - 1]!);
  const rgb = (c: { r: number; g: number; b: number }): string =>
    "rgb(" + Math.round(c.r) + " " + Math.round(c.g) + " " + Math.round(c.b) + ")";
  container.style.setProperty("--ambient-1", rgb(palette[0]!));
  container.style.setProperty("--ambient-2", rgb(palette[1]!));
  container.style.setProperty("--ambient-3", rgb(palette[2]!));
  container.dataset.ambient = "on";
  container.dataset.ambientMs = (performance.now() - started).toFixed(2);
}

function viewerOpen(): boolean {
  const container = document.getElementById("viewer-container");
  return !!container && container.style.display !== "none";
}

export function openViewer(index: number): void {
  const cards = fileList.querySelectorAll<HTMLElement>(".file-card");
  if (index < 0 || index >= cards.length) return;
  S.viewerIndex = index;

  // Show the viewer (it stays visible next to the results grid).
  const container = document.getElementById("viewer-container")!;
  container.style.display = "";

  // Clone canvas from the active card into the viewer stage
  const stage = document.getElementById("viewer-stage")!;
  const card = cards[index];
  if (!card) return;
  // Populate header immediately with filename+size (dimensions update on decode)
  populateViewerHeader(card);
  const srcCanvas = card.querySelector<HTMLCanvasElement>(".preview canvas");

  // Simple canvas rendering — no scroll container. Wrap content in a
  // column so the failure info card sits BELOW the image.
  stage.innerHTML = "";
  const stageContent = document.createElement("div");
  stageContent.className = "viewer-stage-content";
  if (srcCanvas) {
    const newCanvas = document.createElement("canvas");
    newCanvas.width = srcCanvas.width;
    newCanvas.height = srcCanvas.height;
    // Programmatic name so the current image is announced with position and
    // dimensions (A11Y-16). The counter below is a polite live region.
    newCanvas.setAttribute("role", "img");
    const cardName = card.querySelector(".name")?.textContent || "";
    newCanvas.setAttribute(
      "aria-label",
      t("viewer.imageLabel", {
        i: index + 1,
        n: cards.length,
        name: cardName,
        w: srcCanvas.width,
        h: srcCanvas.height,
      }),
    );
    const newCtx = newCanvas.getContext("2d")!;
    newCtx.drawImage(srcCanvas, 0, 0);
    stageContent.appendChild(newCanvas);
  }
  // Look up the active card's failure entry up front so the failed
  // placeholder can embed one integrated info card.
  const viewerCardId = card.dataset.cardId!;
  const failedEntry = findFailure(viewerCardId);

  let stageState: "image" | "failed" | "loading" = srcCanvas ? "image" : "loading";
  if (!srcCanvas) {
    const status = card.querySelector(".status");
    const statusText = status ? status.textContent : "";
    const isLoading =
      !status || status.classList.contains("loading") || statusText.trim() === t("viewer.decoding");
    if (!isLoading && statusText.trim()) {
      stageState = "failed";
      // Failed — the failure info card IS the failure state. Error cards
      // (no failedEntry) show a plain message on the band instead.
      const placeholder = document.createElement("div");
      placeholder.className = "viewer-placeholder failed";
      if (failedEntry) {
        placeholder.appendChild(
          createFailureInfo({
            cardId: viewerCardId,
            bytes: failedEntry.bytes,
            prefix: failedEntry.prefix,
            mode: failedEntry.mode ?? failureMode(failedEntry.bytes, failedEntry.prefix),
            fileSize: failedEntry.fileSize,
          }),
        );
      } else {
        // No bytes to describe (generic decode error) — a quiet message card.
        placeholder.classList.add("plain");
        placeholder.innerHTML = `
          <div class="placeholder-title">${t("viewer.decodeFailed")}</div>
          <div class="placeholder-msg">${escapeHtml(statusText)}</div>
        `;
      }
      stageContent.appendChild(placeholder);
    } else if (isLoading) {
      stageState = "loading";
      // Still decoding — show spinner
      stageContent.innerHTML =
        '<div class="viewer-placeholder"><div class="placeholder-spinner"></div><div class="placeholder-msg">' +
        t("viewer.decoding") +
        "</div></div>";
    } else {
      stageState = "failed";
    }
  }
  // Machine-readable stage state for E2E polling (no visual effect): "loading"
  // while the active card is still decoding, "image" when the decoded canvas is
  // on the stage, "failed" when the failure state is shown.
  document.body.dataset.viewerState = stageState;
  document.body.dataset.viewerIndex = String(index);
  stage.appendChild(stageContent);

  // Ambient light follows the image on every viewer image change. Failed
  // decodes and empty stages fall back to the neutral band glow.
  applyAmbient(srcCanvas ?? null);

  // Highlight active thumbnail, scroll into view
  const thumbs = document.querySelectorAll<HTMLElement>(".filmstrip-thumb");
  const currentCard = cards[index];
  const currentCardId = currentCard ? currentCard.dataset.cardId : null;
  thumbs.forEach((t) => {
    t.classList.toggle("active", t.dataset.filmstripCard === currentCardId);
    if (t.dataset.filmstripCard === currentCardId) {
      t.setAttribute("aria-current", "true");
    } else {
      t.removeAttribute("aria-current");
    }
  });
  const activeThumb = Array.from(thumbs).find((t) => t.dataset.filmstripCard === currentCardId);
  if (activeThumb) {
    const track = document.getElementById("filmstripTrack");
    if (track) {
      const tr = track.getBoundingClientRect();
      const ar = activeThumb.getBoundingClientRect();
      const delta = ar.left - tr.left - (tr.width - ar.width) / 2;
      track.scrollTo({ left: Math.max(0, track.scrollLeft + delta), behavior: "smooth" });
    }
  }

  // Update toolbar
  updateToolbar();
}

// "720×480 px" -> "720 × 480"; keeps the reference meta pill's spacing.
function formatDims(raw: string): string {
  const trimmed = raw.replace(/\s*px\s*$/i, "").trim();
  return trimmed ? trimmed.replace(/\s*×\s*/g, " × ") : "";
}

function populateViewerHeader(card: Element): void {
  const encEl = document.getElementById("vhEnc");
  const nameEl = document.getElementById("vhFile");
  const dimsEl = document.getElementById("vhDims");
  const header = document.getElementById("viewer-header");
  if (!encEl || !nameEl || !dimsEl) return;

  const metaName = card.querySelector(".name");
  nameEl.textContent = metaName ? metaName.textContent : "";

  const info = card.querySelector(".info");
  const dimsRaw = info?.querySelector('[data-info="dims"] .info-value')?.textContent || "";
  const encText = info?.querySelector('[data-info="enc"] .info-value')?.textContent || "";
  const dimsText = formatDims(dimsRaw);

  encEl.textContent = encText;
  dimsEl.textContent = dimsText;

  // Hide the pill until the decode has filled in real values (the reference
  // page always has them; the live page briefly doesn't while decoding).
  if (header instanceof HTMLElement) {
    header.style.display = encText || dimsText ? "" : "none";
  }
}

function navigateViewer(dir: -1 | 1): void {
  // Filmstrip thumbs are created in FILE order at card-creation time, so
  // filmstrip order === card order === viewer numbering. Simple cyclic step.
  const cards = fileList.querySelectorAll(".file-card");
  if (cards.length === 0) return;
  const next = (S.viewerIndex + dir + cards.length) % cards.length;
  openViewer(next);
}

export function prevViewer(): void {
  navigateViewer(-1);
}

export function nextViewer(): void {
  navigateViewer(1);
}

// Single owner of the "page chrome follows app state" rules: empty ↔ loaded
// shell, toolbar file/meta block, the "1 / N" counter, the grid toggle label,
// and the format segmented control.
export function updateToolbar(): void {
  const isLoaded = S.totalFiles > 0;
  // Machine-readable pipeline state for E2E polling (no visual effect): tests
  // wait for data-decode-phase="settled" instead of sleeping after a drop.
  document.body.dataset.decodePhase =
    S.pendingDecodes > 0 ? "decoding" : isLoaded ? "settled" : "idle";
  document.body.dataset.decodedCount = String(successCount());
  document.body.dataset.fileCount = String(S.totalFiles);
  document.body.dataset.pendingDecodes = String(S.pendingDecodes);
  if (!isLoaded) document.body.dataset.viewerState = "closed";
  document.body.classList.toggle("is-loaded", isLoaded);
  document.body.classList.toggle("has-files", isLoaded);
  const loaded = document.getElementById("loaded");
  if (loaded) loaded.hidden = !isLoaded;
  const toolbar = document.getElementById("toolbar")!;
  toolbar.classList.toggle("visible", isLoaded);

  // Toolbar file block: the stage's active file, or the first card.
  const cards = fileList.querySelectorAll<HTMLElement>(".file-card");
  const idx = S.viewerIndex >= 0 && S.viewerIndex < cards.length ? S.viewerIndex : 0;
  const active = cards[idx];
  const tbName = document.getElementById("tbFile");
  if (tbName) {
    const nameEl = active ? active.querySelector(".name") : null;
    tbName.textContent = nameEl ? (nameEl.textContent ?? "") : "";
  }
  // Counts are truthful per unit: thumbnails/encodings describe what was
  // actually DECODED (a failed container has 0 of each), containers describe
  // the files accepted. Each unit is pluralised on its own, so a mixed state
  // ("0 images · 1 container") reads correctly.
  const images = successCount();
  const encodings = new Set(successCards().map((e) => e.encoding)).size;
  const countLabel = (n: number, oneKey: string, manyKey: string): string =>
    n === 1 ? t(oneKey) : t(manyKey, { n, m: n });
  const tbMeta = document.getElementById("tbMeta");
  if (tbMeta) {
    tbMeta.textContent =
      countLabel(images, "decoder.imageOne", "decoder.images") +
      " · " +
      countLabel(encodings, "decoder.encodingOne", "decoder.encodings");
  }
  const resultsMeta = document.getElementById("resultsMeta");
  if (resultsMeta) {
    resultsMeta.textContent =
      countLabel(images, "decoder.imageOne", "decoder.images") +
      " · " +
      countLabel(S.totalFiles, "decoder.containerOne", "decoder.containers");
  }

  // Position counter ("1 / N" in the filmstrip row). Visual text updates
  // immediately; the screen-reader announcement is debounced so rapid arrow
  // presses do not queue dozens of live-region messages (edge-audit F15).
  // It shares the page's single polite announcer (#liveStatus) instead of
  // creating a second live region.
  const pos = document.getElementById("viewerPos")!;
  const posIdx = S.viewerIndex >= 0 ? S.viewerIndex + 1 : cards.length > 0 ? 1 : 0;
  pos.textContent = posIdx + " / " + S.cardCount;
  const live = document.getElementById("liveStatus");
  window.clearTimeout((window as unknown as { __viewerLiveTimer?: number }).__viewerLiveTimer);
  (window as unknown as { __viewerLiveTimer?: number }).__viewerLiveTimer = window.setTimeout(
    () => {
      if (live) live.textContent = pos.textContent;
    },
    450,
  );

  // Prev/next controls are meaningless with one image.
  for (const id of ["prevBtn", "nextBtn"]) {
    const btn = document.getElementById(id) as HTMLButtonElement | null;
    if (btn) {
      btn.disabled = cards.length <= 1;
      btn.setAttribute("aria-disabled", cards.length <= 1 ? "true" : "false");
    }
  }

  // Download all: gated until every accepted decode settles, shows decode
  // progress, and turns into Cancel while a ZIP is being built (F02/F05/F27).
  const dlBtn = document.getElementById("downloadAllBtn") as HTMLButtonElement;
  if (dlBtn) {
    const count = successCount();
    const hasWork = count > 0 && isLoaded;
    dlBtn.style.display = hasWork || S.buildingZip || S.pendingDecodes > 0 ? "" : "none";
    if (S.buildingZip) {
      dlBtn.disabled = false;
      dlBtn.textContent = t("app.zipCancel", { done: S.zipDone, total: S.zipTotal });
      dlBtn.title = t("app.zipCancelTitle");
    } else if (S.pendingDecodes > 0) {
      dlBtn.disabled = true;
      dlBtn.textContent = t("app.downloadDecoding", {
        done: Math.max(0, S.totalFiles - S.pendingDecodes),
        total: S.totalFiles,
      });
      dlBtn.title = t("app.downloadDecodingTitle");
    } else {
      dlBtn.disabled = false;
      dlBtn.textContent = t("app.downloadAll");
      dlBtn.title = t("app.zipTitle", {
        fmt: formatLabels[S.downloadFormat] || DEFAULT_FORMAT.label,
      });
    }
  }

  // Small batches use page scrolling; large batches keep a bounded results
  // region with an explicit "scroll inside results" affordance (B5).
  const many = cards.length > 12;
  document.body.classList.toggle("results-many", many);
  const resultsHead = document.querySelector(".results-head");
  let hint = document.getElementById("resultsWindowHint");
  if (resultsHead && !hint) {
    hint = document.createElement("p");
    hint.id = "resultsWindowHint";
    hint.className = "results-window-hint";
    resultsHead.appendChild(hint);
  }
  if (hint) {
    hint.hidden = !many;
    hint.textContent = many
      ? t("decoder.resultsWindowHint", { n: cards.length })
      : t("decoder.resultsAll", { n: cards.length });
  }

  // Keep the segmented control and its backing <select> in sync. The buttons
  // expose their selected state via aria-pressed (the ported markup only had
  // the .is-on class), and the group is labelled "ZIP format".
  const fmtSeg = document.getElementById("fmtSeg");
  if (fmtSeg) {
    fmtSeg.querySelectorAll<HTMLElement>("[data-format]").forEach((btn) => {
      const on = btn.dataset.format === S.downloadFormat;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
  const fmtSelect = document.getElementById("downloadFormatSelect") as HTMLSelectElement | null;
  if (fmtSelect && fmtSelect.value !== S.downloadFormat) fmtSelect.value = S.downloadFormat;
}
// Legacy: show/hide help button now follows the loaded shell via CSS; the
// script-level display override the old layout used is deliberately gone.

export function refreshViewerIfCurrent(cardId: string): void {
  if (!viewerOpen() || S.viewerIndex < 0) return;
  const vCards = fileList.querySelectorAll<HTMLElement>(".file-card");
  if (vCards[S.viewerIndex]?.dataset.cardId === cardId) {
    openViewer(S.viewerIndex);
  }
}
