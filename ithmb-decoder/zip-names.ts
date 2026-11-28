// Pure ZIP-entry naming policy (unit-tested in tests/unit/download-naming.test.ts).
// Kept dependency-free so the Bun unit tests never need a DOM.
//  - strip path separators and leading/trailing dots/spaces (Windows refuses or
//    silently renames those)
//  - escape Windows reserved device names
//  - suffix duplicates so fflate never silently overwrites
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

export function uniqueZipName(
  files: Record<string, Uint8Array>,
  fileName: string,
  ext: string,
): string {
  const base = fileName.replace(/\.(ithmb|ipm)$/i, "") || "decoded";
  let name = base
    .replace(/[\\/]/g, "_")
    .replace(/[\u0000-\u001f<>:"|?*]/g, "_")
    .replace(/^\.+/, "")
    .replace(/[. ]+$/g, "");
  if (!name) name = "decoded";
  if (WINDOWS_RESERVED.test(name)) name = "_" + name;
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
