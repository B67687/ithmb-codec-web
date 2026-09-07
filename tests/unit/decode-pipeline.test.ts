// Unit tests for decode-pipeline.ts (DOM-free by design, so node-scoped.
// decoder.ts applies these to every file via decodeFile).
import { describe, expect, it } from "vitest";
import { classifyResult, parsePixelHeader } from "../../ithmb-decoder/decode-pipeline";

const header = (w: number, h: number, px: number[]): Uint8Array => {
  const buf = new Uint8Array(8 + px.length);
  new DataView(buf.buffer).setUint32(0, w, true);
  new DataView(buf.buffer).setUint32(4, h, true);
  buf.set(px, 8);
  return buf;
};

describe("classifyResult", () => {
  it("success when WASM returns bytes", () => {
    expect(classifyResult(1067, new Uint8Array([0]))).toBe("success");
  });

  it("known-failed for null result with known prefix", () => {
    expect(classifyResult(1067, null)).toBe("known-failed");
  });

  it("unknown for null result with unknown prefix", () => {
    expect(classifyResult(9999, null)).toBe("unknown");
  });
});

describe("parsePixelHeader", () => {
  it("parses little-endian width/height and slices pixels at offset 8", () => {
    const px = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];
    const { width, height, pixels } = parsePixelHeader(header(2, 1, px));
    expect(width).toBe(2);
    expect(height).toBe(1);
    expect(pixels).toEqual(new Uint8Array(px));
  });

  it("handles zero dimensions without throwing", () => {
    const { width, pixels } = parsePixelHeader(header(0, 0, []));
    expect(width).toBe(0);
    expect(pixels).toHaveLength(0);
  });
});
