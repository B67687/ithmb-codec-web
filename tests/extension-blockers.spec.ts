import { readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

// uBlock Origin Lite's default rules block any first-party script whose URL
// looks like anti-fingerprinting code. The decoder used to ship
// `fingerprint.js`, which made uBOL block the module and left the decoder
// permanently unready. Keep module filenames away from filter-list bait.
const BLOCKED_NAME = /(^|[-_.])(fingerprint|analytics|tracker|telemetry|beacon)([-_.]|$)/i;

test("shipped decoder module names are not filter-list bait", () => {
  const dir = join(process.cwd(), "ithmb-decoder");
  const names = readdirSync(dir)
    .filter((name) => name.endsWith(".js"))
    .filter((name) => !["ithmb_wasm.js", "ithmb_wasm_bg.js"].includes(name));
  const hits = names.filter((name) => BLOCKED_NAME.test(name));
  expect(hits, `rename these modules: ${hits.join(", ")}`).toEqual([]);
});
