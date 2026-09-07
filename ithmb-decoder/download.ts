import { successCards } from "./cards.js";
import { zipSync } from "./fflate-bundle.js";
import { S } from "./state.js";
import { extMap, formatLabels } from "./utils.js";

// Pure zip-entry naming policy (unit-tested in tests/unit/download-naming.test.ts).
// Strip path separators and leading dots so a hostile filename can never
// produce a zip-slip-style entry (CWE-22); suffix duplicates so fflate
// never silently overwrites.
export function uniqueZipName(
  files: Record<string, Uint8Array>,
  fileName: string,
  ext: string,
): string {
  const base = fileName.replace(/\.(ithmb|ipm)$/i, "") || "decoded";
  let name = base.replace(/[\\/]/g, "_").replace(/^\.+/, "");
  if (!name) name = "decoded";
  name += ext;
  if (files[name]) {
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const suffix = dot > 0 ? name.slice(dot) : "";
    let i = 2;
    while (files[stem + "-" + i + suffix]) i++;
    name = stem + "-" + i + suffix;
  }
  return name;
}

export async function downloadAll(): Promise<void> {
  const files: Record<string, Uint8Array> = {};
  for (const { canvas, fileName } of successCards()) {
    const ext = extMap[S.downloadFormat] || ".jpg";
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, S.downloadFormat, 0.92),
    );
    if (blob) {
      const name = uniqueZipName(files, fileName, ext);
      files[name] = new Uint8Array(await blob.arrayBuffer());
    }
  }
  const content = new Blob([zipSync(files)], { type: "application/zip" });
  const url = URL.createObjectURL(content);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ithmb-pictures-converted-to-${(formatLabels[S.downloadFormat] || "JPEG").toLowerCase()}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
