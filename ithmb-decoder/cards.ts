// cards.ts — single owner of the decode-result lists.
//
// WHY THIS MODULE EXISTS: `successfulDecodes`/`failedDecodes` used to be plain
// exported arrays in state.js that every module mutated directly — multiple
// writers with no invariants (the duplicate length-reset dead line was a
// symptom). All writes now go through this module's functions; reads use the
// query accessors below.
//
// Invariants (enforced here):
//   - failure entries carry a short byte prefix (failure metadata)
//   - success entries never retain raw file bytes (F01: memory)
//   - ERROR cards are never stored (they have no renderable bytes — decoder.js)
//   - resetCards() clears both lists together (first-batch reset)

import type { FrameInfo } from "./decode-pipeline.js";

export interface SuccessEntry {
  cardId: string;
  canvas: HTMLCanvasElement;
  fileName: string;
  prefix: number;
  fileSize: number;
  width: number;
  height: number;
  /** Human-readable encoding name (e.g. "UYVY 4:2:2"), used by the toolbar
   *  meta line ("N thumbnails · N encodings"). */
  encoding: string;
  /** True when the image is an embedded JPEG rather than a codec profile (F7). */
  jpeg: boolean;
  /** Set when the file held several frames and frame 0 was rendered (MT-004). */
  frame: FrameInfo | null;
}

export interface FailureEntry {
  cardId: string;
  /** Only the first LIMITS.FAILURE_BYTES bytes: enough to describe the failure. */
  bytes: Uint8Array;
  mode?: "damaged" | "unknown" | "database";
  prefix: number;
  fileName: string;
  fileSize: number;
}

const successful: SuccessEntry[] = [];
const failed: FailureEntry[] = [];

export function addSuccess(entry: SuccessEntry): void {
  successful.push(entry);
}

export function addFailure(entry: FailureEntry): void {
  failed.push(entry);
}

export function resetCards(): void {
  successful.length = 0;
  failed.length = 0;
}

export function successCount(): number {
  return successful.length;
}

// Read accessors return copies so callers can iterate/find without being able
// to mutate the lists (arrays here are small — tens of entries).
export function successCards(): SuccessEntry[] {
  return [...successful];
}

export function failedCards(): FailureEntry[] {
  return [...failed];
}

export function findSuccess(cardId: string): SuccessEntry | undefined {
  return successful.find((e) => e.cardId === cardId);
}

export function findFailure(cardId: string): FailureEntry | undefined {
  return failed.find((e) => e.cardId === cardId);
}
