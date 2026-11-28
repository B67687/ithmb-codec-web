// WASM bindings — paired with ithmb_wasm.js (v0.0.1)
// Source: crates/ithmb-wasm in github.com/B67687/Ithmb-Codec

/**
 * Decode a `.ithmb` file from raw bytes into RGBA pixel data.
 *
 * Returns `Some(buffer)` on success where the buffer layout is:
 *   [width: 4 bytes LE][height: 4 bytes LE][RGBA pixel data ...]
 *
 * Returns `None` if decoding fails (unsupported format, corrupt data, etc.).
 * @param {Uint8Array} bytes
 * @returns {Uint8Array | undefined}
 */
export function decode_ithmb(bytes) {
  const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
  const len0 = WASM_VECTOR_LEN;
  const ret = wasm.decode_ithmb(ptr0, len0);
  let v2;
  if (ret[0] !== 0) {
    v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
  }
  return v2;
}

/**
 * Look up the human-readable encoding name for a given format prefix.
 *
 * Returns `"Unknown format"` if the prefix is not recognized.
 * @param {number} prefix
 * @returns {string}
 */
export function get_encoding_name(prefix) {
  let deferred1_0;
  let deferred1_1;
  try {
    const ret = wasm.get_encoding_name(prefix);
    deferred1_0 = ret[0];
    deferred1_1 = ret[1];
    return getStringFromWasm0(ret[0], ret[1]);
  } finally {
    wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
  }
}

/**
 * Read the 4-byte big-endian format prefix from a byte slice.
 *
 * Returns 0 if the slice is shorter than 4 bytes.
 * @param {Uint8Array} bytes
 * @returns {number}
 */
export function peek_prefix(bytes) {
  const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
  const len0 = WASM_VECTOR_LEN;
  const ret = wasm.peek_prefix(ptr0, len0);
  return ret >>> 0;
}
export function __wbindgen_init_externref_table() {
  const table = wasm.__wbindgen_externrefs;
  const offset = table.grow(4);
  table.set(0, undefined);
  table.set(offset + 0, undefined);
  table.set(offset + 1, null);
  table.set(offset + 2, true);
  table.set(offset + 3, false);
}
function getArrayU8FromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

function getStringFromWasm0(ptr, len) {
  return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
  if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
    cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
  }
  return cachedUint8ArrayMemory0;
}

function passArray8ToWasm0(arg, malloc) {
  const ptr = malloc(arg.length * 1, 1) >>> 0;
  getUint8ArrayMemory0().set(arg, ptr / 1);
  WASM_VECTOR_LEN = arg.length;
  return ptr;
}

let cachedTextDecoder = new TextDecoder("utf-8", {
  ignoreBOM: true,
  fatal: true,
});
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
  numBytesDecoded += len;
  if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
    cachedTextDecoder = new TextDecoder("utf-8", {
      ignoreBOM: true,
      fatal: true,
    });
    cachedTextDecoder.decode();
    numBytesDecoded = len;
  }
  return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let WASM_VECTOR_LEN = 0;

let wasm;
export function __wbg_set_wasm(val) {
  wasm = val;
}
