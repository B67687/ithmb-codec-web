// formats.ts — the one registry for the image formats the decoder writes.
//
// MIME type, visible label, file extension, magic header and UI/option order
// live here once. Consumers derive from it:
//   - utils.ts            formatLabels / extMap re-exports (public helper module)
//   - download.ts         the encoder + the magic-header guard
//   - card-success-ui.ts  the per-card "Save as" options
//   - viewer.ts / app.ts  toolbar labels and the default format
//   - state.ts            the default ZIP/save format
//   - scripts/build-site.mts  the artifact allowlist extensions
//   - tests/unit/formats.test.ts  registry invariants + MIME-literal guard
//
// Build note: this module is build-time-inlined into utils.js by
// scripts/build.mts (the decoder build compiles utils.ts with bundling), so it
// never becomes a separate public file and the deployed artifact count stays
// unchanged.

export interface OutputFormat {
  /** MIME type handed to canvas.toBlob and used as the option value. */
  mime: string;
  /** Short label shown on buttons, selects and in the ZIP file name. */
  label: string;
  /** File extension written after the base name (leading dot). */
  extension: string;
  /** Leading bytes asserted before the bytes are named with `extension`. */
  magic: readonly number[] | null;
  /** Optional second header check (WebP: "WEBP" at offset 8). */
  magicAt?: { offset: number; bytes: readonly number[] };
}

export const JPEG: OutputFormat = {
  mime: "image/jpeg",
  label: "JPEG",
  extension: ".jpg",
  magic: [0xff, 0xd8, 0xff],
};

export const PNG: OutputFormat = {
  mime: "image/png",
  label: "PNG",
  extension: ".png",
  magic: [0x89, 0x50, 0x4e, 0x47],
};

export const BMP: OutputFormat = {
  mime: "image/bmp",
  label: "BMP",
  extension: ".bmp",
  magic: [0x42, 0x4d],
};

export const WEBP: OutputFormat = {
  mime: "image/webp",
  label: "WebP",
  extension: ".webp",
  // RIFF container; the "WEBP" fourCC at offset 8 distinguishes it from other
  // RIFF payloads (e.g. WAV), so both parts are checked.
  magic: [0x52, 0x49, 0x46, 0x46],
  magicAt: { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
};

/** UI and option order: JPEG first (the default), then PNG, BMP, WebP. */
export const OUTPUT_FORMATS: readonly OutputFormat[] = [JPEG, PNG, BMP, WEBP];

/** Default output format (first in the UI order). */
export const DEFAULT_FORMAT: OutputFormat = JPEG;

const BY_MIME = new Map<string, OutputFormat>(
  OUTPUT_FORMATS.map((format): [string, OutputFormat] => [format.mime, format]),
);

/** Registry entry for a MIME type, or undefined for an unknown format. */
export function formatByMime(mime: string): OutputFormat | undefined {
  return BY_MIME.get(mime);
}

/** MIME -> visible label (derived; kept as a lookup for existing callers). */
export const formatLabels: Record<string, string> = Object.fromEntries(
  OUTPUT_FORMATS.map((format) => [format.mime, format.label]),
);

/** MIME -> file extension (derived; kept as a lookup for existing callers). */
export const extMap: Record<string, string> = Object.fromEntries(
  OUTPUT_FORMATS.map((format) => [format.mime, format.extension]),
);

/**
 * Guard against a browser silently falling back to PNG (the old "BMP" bug):
 * the produced bytes must carry that format's header before they are named
 * with its extension. Unknown formats have no header to check, matching the
 * encoder's previous behaviour.
 */
export function hasMagic(bytes: Uint8Array, format: string): boolean {
  const entry = BY_MIME.get(format);
  if (!entry?.magic) return true;
  if (!entry.magic.every((byte, i) => bytes[i] === byte)) return false;
  if (entry.magicAt) {
    const { offset, bytes: extra } = entry.magicAt;
    return extra.every((byte, i) => bytes[offset + i] === byte);
  }
  return true;
}
