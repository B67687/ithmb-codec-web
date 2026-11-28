#!/usr/bin/env node
// sync-embedded.ts — regenerate the EMBEDDED_EN fallback table in i18n.ts
// from locales/en.json (single source of truth).
//
// When to run: after editing en.json (the lint gate check-i18n.ts will also
// fail on drift, so run this to fix it). `npm run sync:i18n`.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DECODER = join(import.meta.dirname, "..", "ithmb-decoder");
const enPath = join(DECODER, "locales/en.json");
const i18nPath = join(DECODER, "i18n.ts");

const en = JSON.parse(readFileSync(enPath, "utf8")) as Record<string, string>;
const body = Object.entries(en)
  .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`)
  .join(",\n");
// Object literal only — the `const EMBEDDED_EN: Record<string, string> = `
// prefix (and any future annotation) stays untouched in the source.
const block = `{\n${body}\n};`;

const src = readFileSync(i18nPath, "utf8");
const startMarker = src.indexOf("const EMBEDDED_EN");
if (startMarker === -1) {
  console.error("EMBEDDED_EN not found in i18n.ts");
  process.exit(1);
}
const eq = src.indexOf("=", startMarker);
const start = src.indexOf("{", eq);
if (start === -1) {
  console.error("EMBEDDED_EN block malformed in i18n.ts");
  process.exit(1);
}
const end = src.indexOf("\n};", start) + 3;
writeFileSync(i18nPath, src.slice(0, start) + block + src.slice(end));
console.log(`EMBEDDED_EN synced from en.json (${Object.keys(en).length} keys)`);
