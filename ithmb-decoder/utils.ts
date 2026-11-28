// Format registry re-exports live here because this module is the decoder's
// shared helper file: scripts/build.mts compiles utils.ts with esbuild
// bundling, which inlines formats.ts into the public utils.js. Consumers keep
// importing from utils.js, so the registry adds no public file/request.
export {
  BMP,
  DEFAULT_FORMAT,
  JPEG,
  OUTPUT_FORMATS,
  PNG,
  WEBP,
  extMap,
  formatByMime,
  formatLabels,
  hasMagic,
} from "./formats.js";

export function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

// The toast hides after 3s; reset the timer on every new toast so a rapid
// sequence doesn't cut the newest message short.
let toastTimer: number | null = null;
export function showToast(msg: string): void {
  const t = document.getElementById("toast")!;
  t.setAttribute("role", "status");
  t.setAttribute("aria-live", "polite");
  t.textContent = msg;
  t.classList.add("show");
  if (toastTimer !== null) clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove("show"), 3000);
}

/**
 * Single typed wrapper for the nav-owned accessible confirm dialog. nav.js
 * publishes `window.IthmbConfirm` on every shell page; `window.confirm` is only
 * the fallback for a page served without the shell (defensive, same as before).
 * The options type is declared once in globals.d.ts.
 */
export function confirm(options: IthmbConfirmOptions): Promise<boolean> {
  const dialog = window.IthmbConfirm;
  return dialog ? dialog(options) : Promise.resolve(window.confirm(options.message));
}

export function escapeHtml(s: string): string {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

export function bytesToHex(bytes: Uint8Array, separator = " "): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(separator);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000; // 32 KB slices avoids call-stack limits on large arrays
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
