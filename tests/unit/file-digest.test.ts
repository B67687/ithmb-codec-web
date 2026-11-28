// Unit tests for fingerprint.ts — the dedupe content hash (MASTER-TRIAGE
// MT-017 / correctness F6). Regression: the old fingerprint hashed only the
// first 256 bytes keyed by filename, so a different image could be dropped.
import { describe, expect, it } from "bun:test";
import { fileFingerprint } from "../../ithmb-decoder/file-digest";

const bytes = (n: number, fill = 0): Uint8Array<ArrayBuffer> =>
  new Uint8Array(new ArrayBuffer(n)).fill(fill);

const blob = (data: Uint8Array<ArrayBuffer>): Blob => new Blob([data]);

const toHex = (data: Uint8Array): string =>
  Array.from(data)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

describe("fileFingerprint (MT-017)", () => {
  it("returns the SHA-256 of the whole file", async () => {
    const data = bytes(1024, 7);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
    expect(await fileFingerprint(blob(data))).toBe(toHex(digest));
  });

  it("hashes differently when only byte 1000 differs", async () => {
    const a = bytes(2048, 1);
    const b = bytes(2048, 1);
    b[1000] = 0xff;
    // Byte 1000 is far past the old 256-byte sample window.
    expect(await fileFingerprint(blob(a))).not.toBe(await fileFingerprint(blob(b)));
  });

  it("is identical for identical content regardless of blob identity", async () => {
    expect(await fileFingerprint(blob(bytes(512, 9)))).toBe(
      await fileFingerprint(blob(bytes(512, 9))),
    );
  });

  it("distinguishes an added trailing byte (full length participates)", async () => {
    const a = bytes(300, 3);
    const b = bytes(301, 3);
    expect(await fileFingerprint(blob(a))).not.toBe(await fileFingerprint(blob(b)));
  });
});
