#!/usr/bin/env bash
# check-wasm-drift.sh — verify the committed wasm's imports are all provided
# by the hand-adapted loader glue (ithmb_wasm_bg.js).
#
# The loader is hand-modified and the wasm binary is copied from
# crates/ithmb-wasm (wasm-pack). A rebuild that adds a wasm import — e.g.
# console_error_panic_hook's js_sys::Error glue (__wbg_new_...) — breaks the
# decoder at RUNTIME with no warning because the glue doesn't define the
# handler. This catches that class at commit/CI time.
#
# Usage: scripts/check-wasm-drift.sh
set -euo pipefail
cd "$(dirname "$0")/.."

WASM=ithmb-decoder/ithmb_wasm_bg.wasm
GLUE=ithmb-decoder/ithmb_wasm_bg.js

node - "$WASM" "$GLUE" <<'JS'
const fs = require("fs");
const [wasmPath, gluePath] = process.argv.slice(2);
const imports = WebAssembly.Module.imports(
  new WebAssembly.Module(fs.readFileSync(wasmPath)),
);
const glue = fs.readFileSync(gluePath, "utf8");
let fail = 0;
for (const imp of imports) {
  // The glue (wasm-bindgen output) defines one handler function per import
  // name; the hand-adapted loader re-exports them. If the name is missing
  // from the glue, instantiation will throw an "unknown import" TypeError.
  const re = new RegExp("(?:function|const|let|var)\\s+" + imp.name + "\\b");
  if (!re.test(glue)) {
    console.log("MISSING IMPORT HANDLER: " + imp.name + " (module " + imp.module + ")");
    fail = 1;
  }
}
if (fail) {
  console.log("FAIL: wasm imports drift from the loader glue.");
  console.log("Regenerate with: wasm-pack build --target web --release (crates/ithmb-wasm),");
  console.log("then copy ithmb_wasm_bg.wasm ONLY — do not replace the hand-adapted loader.");
  process.exit(1);
}
console.log("wasm imports OK (" + imports.length + " imports, all handled by glue)");
JS
