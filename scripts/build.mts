#!/usr/bin/env node
import { readdirSync } from "node:fs";
import { join } from "node:path";
// build.ts — esbuild transform-only build for Ithmb-Codec-Web.
//
// Strategy: the site is served as committed static assets with native browser
// ES-module loading (<script type="module">). We therefore do NOT bundle —
// `bundle: false` compiles each hand-written .ts to the SAME public .js path
// it already occupies, preserving the exact module graph, import specifiers,
// and classic-script globals. This keeps every public URL identical.
//
//   ithmb-decoder/*.ts  ->  ithmb-decoder/*.js   (ESM, es2022)
//   nav.ts footer.ts lang-redirect.ts -> *.js   (IIFE, es2022)
//
// The generated wasm glue (ithmb_wasm.js / ithmb_wasm_bg.js) is never an
// input or output of this build.
import { build } from "esbuild";

const ROOT = join(import.meta.dirname, "..");
process.chdir(ROOT);

const decoderEntries = readdirSync(join(ROOT, "ithmb-decoder"))
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))
  .map((f) => join("ithmb-decoder", f));

// fflate is an npm dependency that the browser module graph cannot resolve
// (native ESM has no node_modules resolution). Bundle it once into a
// self-contained ES module; download.ts imports it via a relative path.
await build({
  stdin: {
    contents: 'export * from "fflate";',
    sourcefile: "fflate-bundle-entry.ts",
    resolveDir: ROOT,
  },
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  outfile: "ithmb-decoder/fflate-bundle.js",
  logLevel: "info",
});

await build({
  entryPoints: decoderEntries,
  bundle: false,
  format: "esm",
  target: "es2022",
  outdir: "ithmb-decoder",
  outbase: "ithmb-decoder",
  logLevel: "info",
});

await build({
  entryPoints: ["theme.ts", "nav.ts", "footer.ts", "lang-redirect.ts"],
  bundle: false,
  format: "iife",
  target: "es2022",
  outdir: ".",
  outbase: ".",
  logLevel: "info",
});

// ─── cache-busting: content-hash ?v= on every asset reference ───
// The HTML references assets as /nav.js?v=3 etc. Those versions were hand-
// bumped (easy to forget → stale-cache bugs after an update). Compute a
// content hash of each built asset and rewrite ?v= to match, so the HTML
// always references exactly what was built. Deterministic: identical source
// → identical hashes, so a fresh clone + build produces no diff. CI enforces
// this with `git diff --exit-code` after the build.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";

function assetHash(relPath: string): string {
  const buf = readFileSync(join(ROOT, relPath));
  return createHash("sha256").update(buf).digest("hex").slice(0, 8);
}

function bumpCacheVersions(): void {
  const htmlDirs = [
    ROOT,
    join(ROOT, "guide"),
    join(ROOT, "enterprise"),
    join(ROOT, "zh"),
    join(ROOT, "zh", "guide"),
    join(ROOT, "zh", "enterprise"),
    join(ROOT, "ithmb-decoder"),
  ];
  const htmlFiles: string[] = [];
  for (const d of htmlDirs) {
    try {
      for (const f of readdirSync(d))
        if (f.endsWith(".html") && statSync(join(d, f)).isFile()) htmlFiles.push(join(d, f));
    } catch {
      // dir absent
    }
  }
  let changed = 0;
  for (const f of htmlFiles) {
    const html = readFileSync(f, "utf8");
    const next = html.replace(/(src|href)="\/([^"?]+)\?v=[^"]*"/g, (m, attr, asset) => {
      const p = join(ROOT, asset);
      if (!statSync(p, { throwIfNoEntry: false })) return m; // non-built asset
      return `${attr}="/${asset}?v=${assetHash(asset)}"`;
    });
    if (next !== html) {
      writeFileSync(f, next);
      changed++;
    }
  }
  if (changed > 0) console.log(`cache-busted ?v= in ${changed} HTML file(s)`);
}

bumpCacheVersions();
