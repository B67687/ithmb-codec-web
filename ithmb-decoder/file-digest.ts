// fingerprint.ts — content fingerprint used by batch dedupe (MT-017).
//
// Dedupe must compare the WHOLE file: two genuinely different images can share
// a filename and the first 256 bytes. The decoder caps a file at 8 MB, so
// hashing the full content is cheap (the batch already reads every file).
// Kept DOM-free so it can be unit-tested in Bun.
import { bytesToHex } from "./utils.js";

export async function fileFingerprint(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return bytesToHex(new Uint8Array(hash), "");
}
