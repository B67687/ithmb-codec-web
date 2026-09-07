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

export function escapeHtml(s: string): string {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

export const formatLabels: Record<string, string> = {
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/bmp": "BMP",
  "image/webp": "WebP",
};

export const extMap: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/bmp": ".bmp",
  "image/webp": ".webp",
};

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
