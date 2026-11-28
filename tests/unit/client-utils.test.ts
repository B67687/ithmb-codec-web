// Unit tests for ithmb-decoder pure utility functions
import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  BMP,
  DEFAULT_FORMAT,
  JPEG,
  OUTPUT_FORMATS,
  PNG,
  WEBP,
  formatByMime,
  hasMagic,
} from "../../ithmb-decoder/formats";
import { KNOWN_PREFIXES } from "../../ithmb-decoder/state";
import {
  bytesToBase64,
  bytesToHex,
  extMap,
  formatLabels,
  formatSize,
} from "../../ithmb-decoder/utils";

const DECODER = join(import.meta.dir, "..", "..", "ithmb-decoder");

describe("formatSize", () => {
  it("formats bytes", () => {
    expect(formatSize(0)).toBe("0 B");
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(1023)).toBe("1023 B");
  });

  it("formats kilobytes", () => {
    expect(formatSize(1024)).toBe("1.0 KB");
    expect(formatSize(1536)).toBe("1.5 KB");
    expect(formatSize(1048575)).toBe("1024.0 KB");
  });

  it("formats megabytes", () => {
    expect(formatSize(1048576)).toBe("1.0 MB");
    expect(formatSize(691200)).toBe("675.0 KB");
  });
});

describe("bytesToHex", () => {
  it("converts bytes to space-separated hex", () => {
    const bytes = new Uint8Array([0x0a, 0x1b, 0x2c]);
    expect(bytesToHex(bytes)).toBe("0a 1b 2c");
  });

  it("converts bytes to joined hex with custom separator", () => {
    const bytes = new Uint8Array([0xff, 0x00]);
    expect(bytesToHex(bytes, "")).toBe("ff00");
    expect(bytesToHex(bytes, ":")).toBe("ff:00");
  });

  it("pads single-digit hex values", () => {
    const bytes = new Uint8Array([0x01, 0x0f]);
    expect(bytesToHex(bytes)).toBe("01 0f");
  });

  it("returns empty string for empty input", () => {
    expect(bytesToHex(new Uint8Array([]))).toBe("");
  });
});

describe("bytesToBase64", () => {
  it("encodes bytes to base64", () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    expect(bytesToBase64(bytes)).toBe("SGVsbG8=");
  });

  it("handles empty input", () => {
    expect(bytesToBase64(new Uint8Array([]))).toBe("");
  });

  it("round-trips through atob", () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255]);
    const b64 = bytesToBase64(bytes);
    const decoded = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    expect(decoded).toEqual(bytes);
  });
});

describe("formatLabels", () => {
  it("maps MIME types to human labels", () => {
    expect(formatLabels["image/jpeg"]).toBe("JPEG");
    expect(formatLabels["image/png"]).toBe("PNG");
    expect(formatLabels["image/bmp"]).toBe("BMP");
    expect(formatLabels["image/webp"]).toBe("WebP");
  });
});

describe("extMap", () => {
  it("maps MIME types to file extensions", () => {
    expect(extMap["image/jpeg"]).toBe(".jpg");
    expect(extMap["image/png"]).toBe(".png");
    expect(extMap["image/bmp"]).toBe(".bmp");
    expect(extMap["image/webp"]).toBe(".webp");
  });
});

// CH-11: one formats registry (mime, label, extension, magic, option order).
describe("formats registry", () => {
  it("keeps the UI/option order JPEG, PNG, BMP, WebP", () => {
    expect(OUTPUT_FORMATS.map((format) => format.label)).toEqual(["JPEG", "PNG", "BMP", "WebP"]);
    expect(OUTPUT_FORMATS).toEqual([JPEG, PNG, BMP, WEBP]);
    expect(DEFAULT_FORMAT).toBe(JPEG);
  });

  it("has one complete record per format", () => {
    for (const format of OUTPUT_FORMATS) {
      expect(format.mime).toMatch(/^image\/[a-z]+$/);
      expect(format.label).toBeTruthy();
      expect(format.extension).toMatch(/^\.[a-z]+$/);
      expect(format.magic?.length ?? 0).toBeGreaterThan(0);
      expect(formatByMime(format.mime)).toBe(format);
    }
    expect(formatByMime("image/avif")).toBeUndefined();
  });

  it("accepts only bytes that carry the declared magic header", () => {
    const bytes = (...values: number[]): Uint8Array => new Uint8Array(values);
    expect(hasMagic(bytes(0xff, 0xd8, 0xff, 0x00), JPEG.mime)).toBe(true);
    expect(hasMagic(bytes(0x89, 0x50, 0x4e, 0x47), PNG.mime)).toBe(true);
    expect(hasMagic(bytes(0x42, 0x4d, 0x00), BMP.mime)).toBe(true);
    // WebP is a RIFF container: RIFF alone is not enough, the fourCC matters.
    expect(
      hasMagic(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50), WEBP.mime),
    ).toBe(true);
    expect(
      hasMagic(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45), WEBP.mime),
    ).toBe(false);
    expect(hasMagic(bytes(0x89, 0x50, 0x4e, 0x47), JPEG.mime)).toBe(false);
    // Unknown formats have no header contract (the encoder's old behaviour).
    expect(hasMagic(bytes(1, 2, 3), "image/avif")).toBe(true);
  });

  it("keeps MIME literals out of every other decoder module", () => {
    for (const file of readdirSync(DECODER)) {
      if (!file.endsWith(".ts") || file === "formats.ts") continue;
      const src = readFileSync(join(DECODER, file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      expect(src, `${file}: MIME literal outside formats.ts`).not.toMatch(
        /["']image\/(?:jpeg|png|bmp|webp)["']/,
      );
    }
  });
});

describe("KNOWN_PREFIXES (state)", () => {
  it("is a Set of numbers", () => {
    expect(KNOWN_PREFIXES).toBeInstanceOf(Set);
    for (const p of KNOWN_PREFIXES) {
      expect(typeof p).toBe("number");
    }
  });

  it("contains expected common prefixes", () => {
    expect(KNOWN_PREFIXES.has(1067)).toBe(true);
    expect(KNOWN_PREFIXES.has(1005)).toBe(true);
    expect(KNOWN_PREFIXES.has(3001)).toBe(true);
  });

  it("has more than 40 entries", () => {
    expect(KNOWN_PREFIXES.size).toBeGreaterThan(40);
  });

  it("does not contain 0 or negative numbers", () => {
    expect(KNOWN_PREFIXES.has(0)).toBe(false);
    expect(KNOWN_PREFIXES.has(-1)).toBe(false);
  });
});
