// Unit tests for decode-pipeline.ts (DOM-free by design, so node-scoped.
// decoder.ts applies these to every file via decodeFile).
//
// B3 data-integrity anchors:
//   MT-003 — an unknown-prefix payload whose length matches a profile is
//            refused before WASM (the codec would fabricate a success).
//   MT-004 — a multi-frame payload is clipped to frame 0 before decoding.
import { describe, expect, it } from "bun:test";
import {
  classifyFailure,
  classifyResult,
  heuristicWouldMatch,
  parsePixelHeader,
  peekPrefix,
  pickFrame,
  planDecode,
} from "../../ithmb-decoder/decode-pipeline";
import { PROFILES } from "../../ithmb-decoder/profiles";

const u32be = (value: number): Uint8Array =>
  new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

const ithmb = (prefix: number, payload: Uint8Array): Uint8Array => concat(u32be(prefix), payload);

const zeros = (n: number): Uint8Array => new Uint8Array(n);

const header = (w: number, h: number, px: number[]): Uint8Array => {
  const buf = new Uint8Array(8 + px.length);
  new DataView(buf.buffer).setUint32(0, w, true);
  new DataView(buf.buffer).setUint32(4, h, true);
  buf.set(px, 8);
  return buf;
};

describe("profiles table (generated from the codec)", () => {
  it("holds exactly the 53 active profiles (1044 disabled upstream, F5)", () => {
    expect(Object.keys(PROFILES)).toHaveLength(53);
    expect(Object.hasOwn(PROFILES, 1044)).toBe(false);
    expect(Object.hasOwn(PROFILES, 1067)).toBe(true);
    expect(Object.hasOwn(PROFILES, 3001)).toBe(true);
  });

  it("carries frame bytes and frame strides that differ only for padded slots", () => {
    expect(PROFILES[1055]).toEqual({ frameBytes: 32768, frameStride: 32768 });
    // 3004 is a padded 56x55 slot: 6160 bytes of pixels inside an 8192 slot.
    expect(PROFILES[3004]).toEqual({ frameBytes: 6160, frameStride: 8192 });
    // Nano 7G alternates are selected by data length.
    expect(PROFILES[1013]?.alternates).toEqual([5000]);
  });
});

describe("peekPrefix", () => {
  it("reads the big-endian prefix and returns 0 for short slices", () => {
    expect(peekPrefix(ithmb(1055, zeros(4)))).toBe(1055);
    expect(peekPrefix(new Uint8Array([0x00, 0x03]))).toBe(0);
  });
});

describe("heuristicWouldMatch (MT-003)", () => {
  it("matches the codec's 256-byte size window", () => {
    expect(heuristicWouldMatch(2520)).toBe(true); // 1009 frame exactly
    expect(heuristicWouldMatch(2519)).toBe(true); // within tolerance
    expect(heuristicWouldMatch(3000)).toBe(true); // within 108 of 1032
    expect(heuristicWouldMatch(8192)).toBe(true); // 1066/3003
    expect(heuristicWouldMatch(1000)).toBe(false);
    expect(heuristicWouldMatch(8 * 1024 * 1024 - 8)).toBe(false);
  });
});

describe("pickFrame (MT-004)", () => {
  it("detects an exact multi-frame payload and its frame count", () => {
    expect(pickFrame(1055, 32768 * 10)).toEqual({ stride: 32768, total: 10 });
    expect(pickFrame(1009, 2520 * 2)).toEqual({ stride: 2520, total: 2 });
  });

  it("does not flag a single frame (with or without trailing tolerance)", () => {
    expect(pickFrame(1055, 32768)).toBeNull();
    expect(pickFrame(1009, 2519)).toBeNull();
    expect(pickFrame(1009, 2520 + 256)).toBeNull();
  });

  it("clips a truncated multi-frame payload but reports an unknown count", () => {
    const pick = pickFrame(1009, 2520 + 1260);
    expect(pick).toEqual({ stride: 2520, total: null });
  });

  it("resolves Nano 7G alternate strides by length", () => {
    expect(pickFrame(1013, 5000 * 2)).toEqual({ stride: 5000, total: 2 });
    expect(pickFrame(1013, 77440 * 2)).toEqual({ stride: 77440, total: 2 });
  });

  it("ignores unknown prefixes", () => {
    expect(pickFrame(9999, 5000)).toBeNull();
  });
});

describe("planDecode (MT-003/MT-004)", () => {
  it("refuses an unknown prefix whose length matches a profile — the F1 false success", () => {
    // 0xDEADBEEF + 2520 random-looking bytes: the codec's heuristic decoded this
    // as a 42x30 image and the card claimed "Decoded".
    const plan = planDecode(ithmb(0xdeadbeef, zeros(2520)));
    expect(plan.action).toBe("reject");
    if (plan.action === "reject") {
      expect(plan.mode).toBe("unknown");
      expect(plan.prefix).toBe(0xdeadbeef);
    }
  });

  it("refuses the rand3000 fixture (length 108 bytes off profile 1032)", () => {
    expect(planDecode(ithmb(0xdeadbeef, zeros(3000))).action).toBe("reject");
  });

  it("lets an unknown prefix decode when no heuristic can fire (JPEG carve path only)", () => {
    // 1000-byte payload matches no profile within 256 bytes, so the codec skips
    // the heuristic and only the validated embedded-JPEG carve can succeed.
    const plan = planDecode(ithmb(0x0badcafe, zeros(996)));
    expect(plan.action).toBe("decode");
    if (plan.action === "decode") {
      expect(plan.jpeg).toBe(true);
      expect(plan.frame).toBeNull();
    }
  });

  it("accepts a bare JPEG stream and labels it as JPEG, not a format", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    const plan = planDecode(jpeg);
    expect(plan.action).toBe("decode");
    if (plan.action === "decode") expect(plan.jpeg).toBe(true);
  });

  it("clips a 10-frame prefixed 1055 payload to frame 0", () => {
    const bytes = ithmb(1055, zeros(32768 * 10));
    const plan = planDecode(bytes);
    expect(plan.action).toBe("decode");
    if (plan.action === "decode") {
      expect(plan.jpeg).toBe(false);
      expect(plan.frame).toEqual({ index: 1, total: 10 });
      expect(plan.input.length).toBe(4 + 32768);
      expect(plan.input[0]).toBe(0x00); // prefix 1055 = 00 00 04 1f
      expect(plan.input[3]).toBe(0x1f);
    }
  });

  it("clips a two-frame 1009 payload to frame 0", () => {
    const bytes = ithmb(1009, concat(zeros(2520), new Uint8Array(2520).fill(0xab)));
    const plan = planDecode(bytes);
    expect(plan.action).toBe("decode");
    if (plan.action === "decode") {
      expect(plan.frame).toEqual({ index: 1, total: 2 });
      expect(plan.input.length).toBe(4 + 2520);
    }
  });

  it("passes a single-frame payload through untouched", () => {
    const bytes = ithmb(1009, zeros(2520));
    const plan = planDecode(bytes);
    expect(plan.action).toBe("decode");
    if (plan.action === "decode") {
      expect(plan.frame).toBeNull();
      expect(plan.input.length).toBe(bytes.length);
    }
  });

  it("passes a trailing-padding single frame through untouched", () => {
    const bytes = ithmb(1009, zeros(2519));
    const plan = planDecode(bytes);
    expect(plan.action).toBe("decode");
    if (plan.action === "decode") expect(plan.frame).toBeNull();
  });

  it("routes database containers to the database failure card", () => {
    const plan = planDecode(concat(new TextEncoder().encode("mhfd"), zeros(2520)));
    expect(plan.action).toBe("reject");
    if (plan.action === "reject") expect(plan.mode).toBe("database");
  });

  it("rejects sub-prefix input as damaged", () => {
    const plan = planDecode(new Uint8Array([0x00, 0x03]));
    expect(plan.action).toBe("reject");
    if (plan.action === "reject") expect(plan.mode).toBe("damaged");
  });
});

describe("classifyFailure (F5/F7)", () => {
  it("classifies a corrupt JPEG container as damaged, not unknown", () => {
    // 17-byte SOI+SOF2 bomb fixture (65535 x 65535 declared).
    const bomb = new Uint8Array(17);
    bomb.set(
      [0xff, 0xd8, 0xff, 0xc2, 0x00, 0x11, 0x08, 0xff, 0xff, 0xff, 0xff, 0x01, 0x01, 0x11, 0x00],
      0,
    );
    expect(classifyFailure(bomb, peekPrefix(bomb))).toBe("damaged");
  });

  it("classifies a known prefix that failed as damaged", () => {
    expect(classifyFailure(ithmb(1005, zeros(96)), 1005)).toBe("damaged");
  });

  it("classifies an unrecognised prefix as unknown (prefix 1044 included, F5)", () => {
    expect(classifyFailure(ithmb(1044, zeros(96)), 1044)).toBe("unknown");
    expect(classifyFailure(ithmb(9999, zeros(96)), 9999)).toBe("unknown");
  });

  it("classifies database magic as database", () => {
    expect(classifyFailure(concat(new TextEncoder().encode("mhbd"), zeros(20)), 0x6d686264)).toBe(
      "database",
    );
  });

  it("classifies empty/short input as damaged", () => {
    expect(classifyFailure(new Uint8Array(0), 0)).toBe("damaged");
    expect(classifyFailure(new Uint8Array([0xff]), 0)).toBe("damaged");
  });
});

describe("classifyResult", () => {
  it("success when WASM returns bytes", () => {
    expect(classifyResult(1067, new Uint8Array([0]))).toBe("success");
  });

  it("known-failed for null result with known prefix", () => {
    expect(classifyResult(1067, null)).toBe("known-failed");
  });

  it("unknown for null result with unknown prefix (1044 no longer known)", () => {
    expect(classifyResult(9999, null)).toBe("unknown");
    expect(classifyResult(1044, null)).toBe("unknown");
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
