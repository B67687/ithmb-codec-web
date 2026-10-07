// ithmb_wasm.d.ts — types for the machine-generated wasm-pack glue.
//
// ithmb_wasm.js / ithmb_wasm_bg.js are GENERATED output from
// `crates/ithmb-wasm` (`wasm-pack build --target web`) plus hand-adapted
// loader glue — they must NEVER be edited. This declaration file only types
// their exported surface so the TS app can import them type-safely.
//
// The signatures below were transcribed from the generated bindings:
//   - decode_ithmb(bytes)  -> Uint8Array | undefined  ([w:4][h:4][RGBA...] or None)
//   - peek_prefix(bytes)   -> number                  (0 if slice < 4 bytes)
//   - get_encoding_name(prefix) -> string
//   - initSync(module?)    -> wasm exports
//   - __wbg_init()         -> Promise<wasm exports>  (default export; fetches
//                             ./ithmb_wasm_bg.wasm?v=1.9.10 when called bare)

export const WASM_VERSION: string;

export function initSync(
  module?: WebAssembly.Module | BufferSource | { module: WebAssembly.Module | BufferSource },
): WebAssembly.Exports;

export default function __wbg_init(
  module_or_path?:
    | string
    | URL
    | Request
    | Response
    | WebAssembly.Module
    | BufferSource
    | { module_or_path: WebAssembly.Module | BufferSource },
): Promise<WebAssembly.Exports>;

export function decode_ithmb(bytes: Uint8Array): Uint8Array | undefined;

export function peek_prefix(bytes: Uint8Array): number;

export function get_encoding_name(prefix: number): string;
