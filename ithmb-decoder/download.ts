import { successCards } from "./cards.js";
import { LIMITS } from "./limits.js";
import { S } from "./state.js";
import {
  BMP,
  DEFAULT_FORMAT,
  confirm,
  extMap,
  formatLabels,
  hasMagic,
  showToast,
} from "./utils.js";
import { t } from "./i18n.js";
import { updateToolbar } from "./viewer.js";

export { uniqueZipName } from "./zip-names.js";
import { uniqueZipName } from "./zip-names.js";

export interface EncodedImage {
  bytes: Uint8Array;
  blob: Blob;
  ext: string;
}

/** 24-bit BI_RGB BMP (bottom-up, rows padded to 4 bytes). */
export function encodeBmp(canvas: HTMLCanvasElement): Blob {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no 2d context");
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const rowSize = Math.ceil((w * 3) / 4) * 4;
  const pixelSize = rowSize * h;
  const fileSize = 14 + 40 + pixelSize;
  const out = new Uint8Array(fileSize);
  const dv = new DataView(out.buffer);
  out[0] = 0x42; // 'B'
  out[1] = 0x4d; // 'M'
  dv.setUint32(2, fileSize, true);
  dv.setUint32(10, 54, true); // pixel data offset
  dv.setUint32(14, 40, true); // BITMAPINFOHEADER size
  dv.setInt32(18, w, true);
  dv.setInt32(22, h, true); // positive height = bottom-up
  dv.setUint16(26, 1, true); // planes
  dv.setUint16(28, 24, true); // bpp
  dv.setUint32(30, 0, true); // BI_RGB
  dv.setUint32(34, pixelSize, true);
  for (let y = 0; y < h; y++) {
    const srcRow = (h - 1 - y) * w * 4;
    const dstRow = 54 + y * rowSize;
    for (let x = 0; x < w; x++) {
      const s = srcRow + x * 4;
      const d = dstRow + x * 3;
      out[d] = rgba[s + 2] ?? 0; // B
      out[d + 1] = rgba[s + 1] ?? 0; // G
      out[d + 2] = rgba[s] ?? 0; // R
    }
  }
  return new Blob([out], { type: BMP.mime });
}

/**
 * Encode one canvas in an explicit format, asserting the produced bytes really
 * match that format before they are named with its extension. Chrome silently
 * falls back to PNG for unsupported toBlob formats (the old "BMP" bug), so the
 * magic check is the guard, not the MIME type (edge-audit F03).
 */
export async function encodeCanvas(
  canvas: HTMLCanvasElement,
  format: string,
  quality = 0.92,
): Promise<EncodedImage> {
  let blob: Blob | null;
  if (format === BMP.mime) {
    blob = encodeBmp(canvas);
  } else {
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, format, quality));
  }
  if (!blob) throw new Error("encode failed: " + format);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!hasMagic(bytes, format)) throw new Error("encoded bytes are not " + format);
  return { bytes, blob, ext: extMap[format] || DEFAULT_FORMAT.extension };
}

/** Per-card "Save JPEG/PNG/BMP/WebP" using the same validated encoder. */
export async function saveCanvasAs(
  canvas: HTMLCanvasElement,
  fileName: string,
  format: string,
): Promise<void> {
  try {
    const { blob, ext } = await encodeCanvas(canvas, format, 0.95);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName.replace(/\.(ithmb|ipm)$/i, "") + ext;
    link.click();
    URL.revokeObjectURL(link.href);
  } catch {
    showToast(t("app.encodeFailed"));
  }
}

function setFormatControlsDisabled(disabled: boolean): void {
  const els = document.querySelectorAll<HTMLButtonElement | HTMLSelectElement>(
    "#fmtSeg button, #downloadFormatSelect, .card-format-select",
  );
  els.forEach((el) => {
    el.disabled = disabled;
  });
  const seg = document.getElementById("fmtSeg");
  if (seg) seg.setAttribute("aria-disabled", disabled ? "true" : "false");
}

function confirmLargeArchive(entryCount: number, approxBytes: number): Promise<boolean> {
  const mb = Math.round(approxBytes / (1024 * 1024));
  return confirm({
    title: t("app.zipLargeTitle"),
    message: t("app.zipLargeMsg", { n: entryCount, mb }),
    confirmLabel: t("app.zipLargeConfirm"),
    cancelLabel: t("ui.cancel"),
  });
}

export async function downloadAll(): Promise<void> {
  if (S.buildingZip) {
    // Second click while building = cancel (edge-audit F05/F27).
    S.zipCancel = true;
    return;
  }
  const entries = successCards();
  if (entries.length === 0) return;

  const format = S.downloadFormat; // snapshot: no mixed archives (F02)
  const approxBytes = entries.reduce((sum, e) => sum + e.fileSize, 0);
  if (approxBytes > LIMITS.ZIP_WARN_BYTES) {
    const ok = await confirmLargeArchive(entries.length, approxBytes);
    if (!ok) return;
  }

  Object.assign(S, { buildingZip: true, zipCancel: false, zipDone: 0, zipTotal: entries.length });
  setFormatControlsDisabled(true);
  updateToolbar();
  const files: Record<string, Uint8Array> = {};
  try {
    for (let i = 0; i < entries.length; i++) {
      if (S.zipCancel) break;
      const entry = entries[i]!;
      const encoded = await encodeCanvas(entry.canvas, format, 0.92);
      files[uniqueZipName(files, entry.fileName, encoded.ext)] = encoded.bytes;
      S.zipDone = i + 1;
      updateToolbar();
      if ((i + 1) % LIMITS.ZIP_YIELD_EVERY === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    if (S.zipCancel) {
      showToast(t("app.zipCancelled"));
      return;
    }
    // The ~61 KB fflate bundle is only needed when a ZIP is actually built:
    // import it on demand so the decoder's initial module graph stays small.
    const { zipSync } = await import("./fflate-bundle.js");
    await new Promise((resolve) => setTimeout(resolve, 0));
    const content = new Blob([zipSync(files)], { type: "application/zip" });
    const url = URL.createObjectURL(content);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ithmb-pictures-converted-to-${(formatLabels[format] || DEFAULT_FORMAT.label).toLowerCase()}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    showToast(t("app.encodeFailed"));
  } finally {
    S.buildingZip = false;
    S.zipCancel = false;
    S.zipDone = 0;
    S.zipTotal = 0;
    setFormatControlsDisabled(false);
    updateToolbar();
  }
}
