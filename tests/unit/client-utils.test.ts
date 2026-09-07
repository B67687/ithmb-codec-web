// Unit tests for ithmb-decoder pure utility functions
import { describe, expect, it } from "vitest";
import { KNOWN_PREFIXES } from "../../ithmb-decoder/state";
import {
  bytesToBase64,
  bytesToHex,
  extMap,
  formatLabels,
  formatSize,
} from "../../ithmb-decoder/utils";

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
