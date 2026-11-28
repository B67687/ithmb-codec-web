// decode-pipeline.ts — DOM-free decode decision logic.
//
// WHY A SEPARATE MODULE: decoder.ts is DOM/WASM-coupled (viewer, i18n read
// document at module top), so node-scoped unit tests cannot import it —
// tsconfig.node.json would typecheck the whole DOM chain without globals.
// These pure functions make the per-file branch decisions; decodeFile applies
// them and only then calls into WASM.
//
// Data-integrity rules implemented here (MASTER-TRIAGE B3):
//   MT-003 — an unknown prefix must not reach the codec's length heuristic,
//            which happily fabricates an image from payloads whose size happens
//            to land within 256 bytes of a profile. planDecode refuses those
//            before the WASM call, so they can only fail honestly.
//   MT-004 — a payload longer than one frame is clipped to frame 0 before
//            decoding. RGB565/RGB555 derive their row stride from the payload
//            length, so a multi-frame file would otherwise paint rows sampled
//            across every frame while reporting success.
//   F5/F7  — failure classification comes from the generated codec profile
//            table (no phantom prefix 1044) and a JPEG SOI is a recognised
//            container that failed, not an unknown format.
import { PROFILES } from "./profiles.js";

/** How a decode failure should be described (see failure-info.ts). */
export type FailureMode = "damaged" | "unknown" | "database";

/** One frame of a multi-frame payload: frame 0 is shown. */
export interface FrameInfo {
  /** 1-based index of the frame that is rendered (always the first one). */
  index: 1;
  /** Total frames when the payload length is an exact multiple, else null. */
  total: number | null;
}

/** Decision for one file: decode these bytes, or refuse with a failure card. */
export type DecodePlan =
  | {
      action: "decode";
      prefix: number;
      /** Bytes to hand to decode_ithmb (may be a clipped view of the input). */
      input: Uint8Array;
      /** True when the image comes from a JPEG stream rather than a raw profile. */
      jpeg: boolean;
      /** Set when a multi-frame payload was detected and clipped to frame 0. */
      frame: FrameInfo | null;
    }
  | { action: "reject"; prefix: number; mode: FailureMode };

/** Trailing padding the codec tolerates past one frame (decoder_helpers.rs). */
const TRAILING_PADDING_TOLERANCE = 256;

function isJpegStream(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

/** Apple database containers (ArtworkDB / iTunes-style), never single images. */
function isDatabaseMagic(bytes: Uint8Array): boolean {
  const magic = String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0, bytes[3] ?? 0);
  return magic === "mhfd" || magic === "mhbd" || magic === "mhif";
}

/** Read the 4-byte big-endian format prefix (0 when the slice is shorter). */
export function peekPrefix(bytes: Uint8Array): number {
  if (bytes.length < 4) return 0;
  return ((bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!) >>> 0;
}

/**
 * Replicates the codec's tier-2 "data-size heuristic": an unknown prefix whose
 * payload length is within the trailing-padding tolerance of a profile's
 * frame_byte_length gets decoded with that profile (dispatch.rs). The web
 * boundary must refuse those instead of painting the guess as a success.
 */
export function heuristicWouldMatch(dataLen: number): boolean {
  for (const info of Object.values(PROFILES)) {
    if (Math.abs(dataLen - info.frameBytes) <= TRAILING_PADDING_TOLERANCE) return true;
  }
  return false;
}

export interface FramePick {
  /** One frame's stride inside the container (slot_size for padded profiles). */
  stride: number;
  total: number | null;
}

/**
 * Detect a multi-frame payload for a known prefix and return the clip length.
 *
 * A payload longer than one frame + the codec's padding tolerance cannot be a
 * valid single frame. Candidate strides include the Nano 7G device alternates
 * (1013/1015/1016), which the codec resolves by data length. The largest exact
 * multiple wins; when nothing divides evenly the largest fitting stride is used
 * so frame 0 (which is complete) still decodes correctly and the card reports
 * the frame count as unknown.
 */
export function pickFrame(prefix: number, dataLen: number): FramePick | null {
  const info = PROFILES[prefix];
  if (!info) return null;
  const strides = [info.frameStride, ...(info.alternates ?? [])];
  const oversized = strides.filter(
    (stride) => stride > 0 && dataLen > stride + TRAILING_PADDING_TOLERANCE,
  );
  if (oversized.length === 0) return null;
  const exact = oversized.filter((stride) => dataLen % stride === 0);
  const stride = exact.length > 0 ? Math.max(...exact) : Math.max(...oversized);
  const total = dataLen % stride === 0 ? dataLen / stride : null;
  return { stride, total };
}

/**
 * Decide what to do with one file's bytes. Pure: no DOM, no WASM.
 *
 * - database magic → refuse as a database container;
 * - unknown prefix → refuse (MT-003) unless the file is a JPEG stream or a
 *   carve candidate (payload length matches no profile, so the codec skips the
 *   heuristic and only the validated embedded-JPEG scan can succeed);
 * - known prefix → clip multi-frame payloads to frame 0 (MT-004).
 */
export function planDecode(bytes: Uint8Array): DecodePlan {
  const prefix = peekPrefix(bytes);
  if (bytes.length < 4) return { action: "reject", prefix, mode: "damaged" };
  if (isDatabaseMagic(bytes)) return { action: "reject", prefix, mode: "database" };

  const jpeg = isJpegStream(bytes);
  const known = Object.hasOwn(PROFILES, prefix);
  if (!known && !jpeg) {
    if (heuristicWouldMatch(bytes.length - 4)) {
      // The codec would guess a profile from the payload size and most likely
      // render fabricated pixels as a success. Fail honestly instead.
      return { action: "reject", prefix, mode: "unknown" };
    }
    // No heuristic match: a successful decode can only come from the codec's
    // validated SOI..EOI + JFIF/Exif carve path, which is a real JPEG.
    return { action: "decode", prefix, input: bytes, jpeg: true, frame: null };
  }

  const frame = jpeg ? null : pickFrame(prefix, bytes.length - 4);
  if (frame) {
    return {
      action: "decode",
      prefix,
      input: bytes.subarray(0, 4 + frame.stride),
      jpeg: false,
      frame: { index: 1, total: frame.total },
    };
  }
  return { action: "decode", prefix, input: bytes, jpeg, frame: null };
}

/**
 * Classify a failed decode for the failure card. A JPEG stream is a recognised
 * container (damaged, not unknown); a known profile prefix that fails is
 * damaged; anything else is an unrecognised format.
 */
export function classifyFailure(bytes: Uint8Array, prefix: number): FailureMode {
  if (isDatabaseMagic(bytes)) return "database";
  if (isJpegStream(bytes)) return "damaged";
  if (bytes.length < 16) return "damaged";
  return Object.hasOwn(PROFILES, prefix) ? "damaged" : "unknown";
}

/** Legacy branch helper kept for the feature-contract unit tests. */
export function classifyResult(
  prefix: number,
  result: Uint8Array | null | undefined,
): "success" | "known-failed" | "unknown" {
  if (result) return "success";
  return Object.hasOwn(PROFILES, prefix) ? "known-failed" : "unknown";
}

export function parsePixelHeader(result: Uint8Array): {
  width: number;
  height: number;
  pixels: Uint8Array;
} {
  const width = new DataView(result.buffer).getUint32(0, true);
  const height = new DataView(result.buffer).getUint32(4, true);
  return { width, height, pixels: result.slice(8) };
}
