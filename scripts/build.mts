#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
// build.ts — esbuild transform-only build for Ithmb-Codec-Web.
//
// Strategy: the site is served as committed static assets with native browser
// ES-module loading (<script type="module">). We therefore do NOT bundle —
// `bundle: false` compiles each hand-written .ts to the SAME public .js path
// it already occupies, preserving the exact module graph, import specifiers,
// and classic-script globals. This keeps every public URL identical.
//
//   ithmb-decoder/*.ts  ->  ithmb-decoder/*.js   (ESM, es2022)
//   src/nav.ts src/footer.ts -> assets/js/*.js   (IIFE, es2022)
//   src/theme.ts src/decoder-boot.ts src/decoder-watchdog.ts src/404-lang.ts
//                                              -> assets/js/*.js (IIFE)
//   guide/guide.ts -> assets/js/guide.js, privacy/toc.ts -> assets/js/toc.js (IIFE)
//
// Four source modules are build-time-only and are NEVER emitted on their own:
//   * `ithmb-decoder/locale.ts` is bundled into i18n.js (i18n.ts re-exports
//     its API) and into the classic shell scripts that need it.
//   * `decoder-copy.ts` is bundled into the decoder-boot/decoder-watchdog
//     classic scripts.
//   * `src/modal.ts` and `src/scrollspy.ts` are bundled into the classic page
//     scripts that use them (assets/js/nav.js, assets/js/guide.js,
//     assets/js/toc.js) instead of shipping extra requests.
// That keeps the deployed artifact set unchanged while the shared behaviour
// still has one source.
//
// The generated wasm glue (ithmb_wasm.js / ithmb_wasm_bg.js) is never an
// input or output of this build.
//
// CSS: the stylesheet is authored as ordered layer files in
// `ithmb-decoder/css/` (tokens → base → components → decoder → pages →
// polish → glass) and concatenated here into the single public
// `ithmb-decoder/styles.css`. Same URL, same cascade order, one file on the
// wire.
import { build, transform } from "esbuild";
import { COPYRIGHT_YEAR, renderFooterShell, renderNavShell } from "../src/shell.js";
import {
  LEGACY_REDIRECT_GROUPS,
  ROUTES,
  htmlPage,
  pagePath as routePagePath,
  redirectTarget,
} from "../src/routes.js";

const ROOT = join(import.meta.dirname, "..");
process.chdir(ROOT);

async function buildStylesheet(): Promise<void> {
  const dir = join(ROOT, "ithmb-decoder", "css");
  const layers = readdirSync(dir)
    .filter((f) => f.endsWith(".css"))
    .sort();
  if (layers.length === 0) throw new Error("no CSS layers found in ithmb-decoder/css");
  const css = layers.map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
  // B6: minify the generated bundle — it is the one render-blocking stylesheet
  // on every page, and the layers are authored human-readable.
  const minified = await transform(css, { loader: "css", minify: true });
  writeFileSync(join(ROOT, "ithmb-decoder", "styles.css"), minified.code);
  console.log(`styles: ${layers.length} layers -> ithmb-decoder/styles.css (minified)`);
}
await buildStylesheet();

// Build-time-inlined modules: locale.ts ships inside i18n.js (see the
// dedicated i18n step below), formats.ts ships inside utils.js (see the
// dedicated utils step below), and utils.ts is compiled by that bundled step
// instead of the per-file build. All four therefore never become standalone
// public ESM files, so the registry refactor adds no artifact file. Every other
// .ts here is a public module.
const INLINED_MODULES = new Set(["i18n.ts", "locale.ts", "formats.ts", "utils.ts"]);

const decoderEntries = readdirSync(join(ROOT, "ithmb-decoder"))
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts") && !INLINED_MODULES.has(f))
  .map((f) => join("ithmb-decoder", f));

// fflate is an npm dependency that the browser module graph cannot resolve
// (native ESM has no node_modules resolution). Bundle it once into a
// self-contained ES module; download.ts imports it via a relative path.
//
// MIT requires the copyright and permission notice to travel with copies of
// the software, and minification strips the license comments from the source
// modules. The banner below is injected into the generated bundle so the
// shipped copy always carries fflate's notice. It is part of the file content,
// so it participates in the ?v= content hash and the build stays deterministic.
const FFLATE_NOTICE = `/*! fflate 0.8.3 — MIT License
 * Copyright (c) 2026 Arjun Barrett
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */`;
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
  minify: true,
  banner: { js: FFLATE_NOTICE },
  outfile: "ithmb-decoder/fflate-bundle.js",
  logLevel: "info",
});

await build({
  entryPoints: decoderEntries,
  bundle: false,
  format: "esm",
  target: "es2022",
  minify: true,
  outdir: "ithmb-decoder",
  outbase: "ithmb-decoder",
  logLevel: "info",
});

// i18n.js stays UNMINIFIED: the build rewrites its locale fetch specifier to
// embed content hashes, and keeping the readable concatenation keeps that
// rewrite (and the build assertion/test) stable. It is 3 KB brotli.
// Bundled: locale.ts is a build-time-only module — inlining it here keeps the
// deployed file count flat and gives i18n.js the only runtime copy of the
// locale helpers (i18n.ts re-exports them). The bundle has exactly one import.
await build({
  entryPoints: [join("ithmb-decoder", "i18n.ts")],
  bundle: true,
  format: "esm",
  target: "es2022",
  outdir: "ithmb-decoder",
  outbase: "ithmb-decoder",
  logLevel: "info",
});

// utils.js stays a normal public ESM module, but it is compiled bundled so the
// format registry (formats.ts) is inlined into it: same URL, same exports, no
// extra `formats.js` request. The per-file build above excludes both files.
await build({
  entryPoints: [join("ithmb-decoder", "utils.ts")],
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  outdir: "ithmb-decoder",
  outbase: "ithmb-decoder",
  logLevel: "info",
});

await build({
  entryPoints: {
    theme: "src/theme.ts",
    "decoder-boot": "src/decoder-boot.ts",
    "decoder-watchdog": "src/decoder-watchdog.ts",
    "404-lang": "src/404-lang.ts",
    nav: "src/nav.ts",
    footer: "src/footer.ts",
    guide: "guide/guide.ts",
    toc: "privacy/toc.ts",
  },
  // Bundle the classic page entries: they import the shared routes, locale,
  // decoder-copy, modal and scrollspy modules, and bundling inlines them
  // without adding an extra request (or a separately deployed build-time
  // module) and without changing the classic-script output shape.
  bundle: true,
  format: "iife",
  target: "es2022",
  minify: true,
  outdir: "assets/js",
  logLevel: "info",
});

// ─── cache-busting: content-hash ?v= on every asset reference ───
// The HTML references assets as /assets/js/nav.js?v=3 etc. Those versions were
// hand-bumped (easy to forget → stale-cache bugs after an update). Compute a
// content hash of each built asset and rewrite ?v= to match, so the HTML
// always references exactly what was built. Deterministic: identical source
// → identical hashes, so a fresh clone + build produces no diff. CI enforces
// this with `git diff --exit-code` after the build.
import { createHash } from "node:crypto";
import { statSync } from "node:fs";

function assetHash(relPath: string): string {
  const buf = readFileSync(join(ROOT, relPath));
  return createHash("sha256").update(buf).digest("hex").slice(0, 8);
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".omo",
  ".husky",
  ".playwright-mcp",
  "preview",
  "test-results",
]);

function collectHtml(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collectHtml(join(dir, entry.name), acc);
    } else if (entry.name.endsWith(".html")) {
      acc.push(join(dir, entry.name));
    }
  }
  return acc;
}

const ASSET_EXT = /\.(?:js|css|png|jpe?g|webp|avif|svg|ico|woff2?|json|wasm)$/i;

/** Content-hash one URL reference, or null when it is not a local asset. */
function hashedAssetUrl(ref: string, pageFile: string): string | null {
  const trimmed = ref.trim();
  if (!trimmed || /^(?:https?:)?\/\//.test(trimmed)) return null;
  if (trimmed.startsWith("data:") || trimmed.startsWith("#")) return null;
  const clean = trimmed.split("?")[0] ?? trimmed;
  if (!ASSET_EXT.test(clean)) return null;
  const assetPath = clean.startsWith("/") ? join(ROOT, clean) : join(dirname(pageFile), clean);
  const st = statSync(assetPath, { throwIfNoEntry: false });
  if (!st || !st.isFile()) return null;
  const rel = relative(ROOT, assetPath).split("\\").join("/");
  return clean + "?v=" + assetHash(rel);
}

function rewriteSrcset(value: string, pageFile: string): string {
  return value
    .split(",")
    .map((part) => {
      const m = part.trim().match(/^(\S+)(\s+.*)?$/s);
      if (!m) return part;
      const url = m[1] ?? "";
      const descriptor = m[2] ?? "";
      const hashed = hashedAssetUrl(url, pageFile);
      return hashed ? hashed + descriptor : part.trim();
    })
    .join(", ");
}

/**
 * Content-hash every local asset reference in the HTML: script/link/style
 * assets, images (src + srcset) and direct module URLs. Refs that already
 * carried a hand-written ?v= token are re-hashed from content, so the value
 * can never go stale.
 */
function bumpCacheVersions(): void {
  let changed = 0;
  for (const f of collectHtml(ROOT)) {
    const html = readFileSync(f, "utf8");
    const next = html.replace(
      /(src|href|srcset|imagesrcset)="([^"]*)"/g,
      (match, attr: string, value: string) => {
        if (attr === "srcset" || attr === "imagesrcset") {
          return attr + '="' + rewriteSrcset(value, f) + '"';
        }
        const hashed = hashedAssetUrl(value, f);
        return hashed ? attr + '="' + hashed + '"' : match;
      },
    );
    if (next !== html) {
      writeFileSync(f, next);
      changed++;
    }
  }
  if (changed > 0) console.log("cache-busted ?v= in " + changed + " HTML file(s)");
}

// Every local asset reference must carry a well-formed content hash — a page
// referencing an unhashed asset fails the build instead of shipping a frozen
// or unversioned URL.
function assertCacheTokens(): void {
  const bad: string[] = [];
  for (const f of collectHtml(ROOT)) {
    const html = readFileSync(f, "utf8");
    for (const m of html.matchAll(/(src|href|srcset|imagesrcset)="([^"]*)"/g)) {
      const attr = m[1];
      const value = m[2] ?? "";
      const refs =
        attr === "srcset" || attr === "imagesrcset"
          ? value.split(",").map((part) => (part.trim().match(/^(\S+)/) ?? [])[1] ?? "")
          : [value];
      for (const ref of refs) {
        if (!ref) continue;
        if (/^(?:https?:)?\/\//.test(ref) || ref.startsWith("data:") || ref.startsWith("#"))
          continue;
        const clean = ref.split("?")[0] ?? ref;
        if (!ASSET_EXT.test(clean)) continue;
        if (!/^[^?]+\?v=[0-9a-f]{8}$/.test(ref)) {
          bad.push(relative(ROOT, f) + ": " + ref);
        }
      }
    }
  }
  if (bad.length > 0) {
    console.error("cache-bust: unresolved asset reference(s):");
    for (const b of bad.slice(0, 30)) console.error("  " + b);
    process.exit(1);
  }
}
/** Append ?v=<hash> to every local font/image URL in the generated stylesheet. */
function hashStylesheetAssets(): void {
  const file = join(ROOT, "ithmb-decoder", "styles.css");
  const css = readFileSync(file, "utf8");
  const next = css.replace(
    /url\((["']?)([^"')]*?\.(?:woff2?|png|jpe?g|webp|avif|svg|ico))(\?[^"')]*)?\1\)/g,
    (m, q: string, ref: string) => {
      const clean = ref.split("?")[0] ?? ref;
      const abs = clean.startsWith("/") ? join(ROOT, clean) : join(ROOT, "ithmb-decoder", clean);
      const st = statSync(abs, { throwIfNoEntry: false });
      if (!st || !st.isFile()) return m;
      const rel = relative(ROOT, abs).split("\\").join("/");
      return "url(" + (q || "") + clean + "?v=" + assetHash(rel) + (q || "") + ")";
    },
  );
  if (next !== css) writeFileSync(file, next);
  console.log("styles: font/image URLs content-hashed");
}

/**
 * Content-hash the ES-module graph. Only IMPORT/EXPORT specifiers are
 * rewritten — never arbitrary string literals. The wasm-pack glue
 * (ithmb_wasm.js / ithmb_wasm_bg.js) is excluded: the wasm binary's import
 * namespace keys must stay byte-identical to the glue object keys, so the glue
 * files are hashed by content but NOT rewritten. Their outer import URL
 * (./ithmb_wasm.js?v=...) is hashed by the importing module.
 */
function hashModuleGraph(): void {
  const dir = join(ROOT, "ithmb-decoder");
  const GLUE = new Set(["ithmb_wasm.js", "ithmb_wasm_bg.js"]);
  const graph = new Map<string, { body: string; deps: Set<string> }>();
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".js")) continue;
    if (name === "fflate-bundle.js" || GLUE.has(name)) continue;
    const body = readFileSync(join(dir, name), "utf8");
    const deps = new Set<string>();
    for (const m of body.matchAll(
      /(?:from|import)\s*\(?\s*["'](\.\/[^"']+?\.js)(?:\?[^"']*)?["']/g,
    )) {
      deps.add(m[1].replace(/^\.\//, ""));
    }
    graph.set(name, { body, deps });
  }
  const hashes = new Map<string, string>();
  const visiting = new Set<string>();
  const contentHash = (name: string): string => {
    const body = readFileSync(join(dir, name), "utf8");
    return createHash("sha256").update(body).digest("hex").slice(0, 8);
  };
  // Glue files are versioned by content hash but never edited (wasm import
  // namespace keys must match the binary exactly).
  for (const name of GLUE) hashes.set(name, contentHash(name));
  const rewriteSpecifiers = (body: string, dep: string, depHash: string): string => {
    const escaped = dep.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      "((?:from|import)\\s*\\(?\\s*)([\"'])\\./" + escaped + "(?:\\?[^\"']*)?([\"'])",
      "g",
    );
    return body.replace(re, "$1$2./" + dep + "?v=" + depHash + "$3");
  };
  const rewrite = (name: string): string => {
    const cached = hashes.get(name);
    if (cached) return cached;
    if (visiting.has(name)) throw new Error("module import cycle at " + name);
    visiting.add(name);
    const node = graph.get(name);
    if (!node) throw new Error("module graph: missing " + name);
    let body = node.body;
    for (const dep of node.deps) {
      const depHash = rewrite(dep);
      body = rewriteSpecifiers(body, dep, depHash);
    }
    writeFileSync(join(dir, name), body);
    const hash = createHash("sha256").update(body).digest("hex").slice(0, 8);
    hashes.set(name, hash);
    visiting.delete(name);
    return hash;
  };
  const fflate = readFileSync(join(dir, "fflate-bundle.js"));
  hashes.set("fflate-bundle.js", createHash("sha256").update(fflate).digest("hex").slice(0, 8));
  for (const name of graph.keys()) rewrite(name);
  console.log("modules: " + graph.size + " ES module(s) content-hashed (wasm glue excluded)");
}

/** Hash the locale JSON URLs fetched by i18n.js. */
function hashLocaleFiles(): void {
  const hashes: Record<string, string> = {};
  for (const lang of ["en", "zh"]) {
    hashes[lang] = assetHash(`ithmb-decoder/locales/${lang}.json`);
  }
  const file = join(ROOT, "ithmb-decoder", "i18n.js");
  let body = readFileSync(file, "utf8");
  // The built module is minified, so match with optional whitespace around the
  // concatenation operators.
  body = body.replace(
    /(["'])locales\/\1\s*\+\s*lang\s*\+\s*(["'])\.json\2(?!\s*\+)/g,
    '"locales/" + lang + ".json" + (lang === "zh" ? "?v=' +
      hashes.zh +
      '" : "?v=' +
      hashes.en +
      '")',
  );
  writeFileSync(file, body);
  console.log(`locales: en=${hashes.en} zh=${hashes.zh} hashed into i18n.js`);
}

/**
 * B6: inject <link rel="modulepreload"> for the decoder entry graph.
 *
 * Native ES modules are discovered one import level per round trip. On a
 * 300 ms-RTT link that serialises the shared decoder graph into seconds of
 * purely sequential request latency. Preloading every module reachable from
 * the entry scripts lets the browser fetch them in parallel. The list is
 * derived from the actual import graph at build time, so it cannot drift when
 * a module is added or removed.
 */
function injectModulePreload(): void {
  const dir = join(ROOT, "ithmb-decoder");
  // app.js/i18n.js are the <script type=module> entries; preload them so the
  // browser starts their graph at head parse time.
  const entries = ["app.js", "i18n.js"];
  // fflate is a lazy `import()` used only by ZIP download — preloading it
  // would pull 61 KB into every decoder visit.
  // ithmb_wasm_bg.js is imported by the glue with an intentionally unhashed
  // specifier, so a hashed preload URL could never be reused (double fetch).
  const NO_PRELOAD = new Set(["fflate-bundle.js", "ithmb_wasm_bg.js"]);
  const deps: string[] = [];
  const seen = new Set<string>();
  const visit = (name: string, add: boolean): void => {
    if (seen.has(name)) return;
    seen.add(name);
    if (add && !NO_PRELOAD.has(name)) deps.push(name);
    const body = readFileSync(join(dir, name), "utf8");
    // Static imports/exports only (`from "./x.js"` and `import "./x.js"`);
    // dynamic `import("./x.js")` is deliberately not followed.
    for (const m of body.matchAll(
      /(?:\bfrom\s*|\bimport\s+)(["'])(\.\/[^"']+?\.js)(?:\?[^"']*)?\1/g,
    )) {
      visit((m[2] ?? "").replace(/^\.\//, ""), true);
    }
  };
  for (const entry of entries) visit(entry, true);
  deps.sort();
  const hints = deps.map(
    (name) => `    <link rel="modulepreload" href="/ithmb-decoder/${name}" />`,
  );
  const start = "<!-- perf:modulepreload:start -->";
  const end = "<!-- perf:modulepreload:end -->";
  const block = start + "\n" + hints.join("\n") + "\n    " + end;
  let changed = 0;
  for (const rel of ["ithmb-decoder/index.html", "zh/ithmb-decoder/index.html"]) {
    const file = join(ROOT, rel);
    const html = readFileSync(file, "utf8");
    const next = html.replace(new RegExp(start + "[\\s\\S]*?" + end), block);
    if (next !== html) {
      writeFileSync(file, next);
      changed++;
    }
  }
  console.log(`perf: ${deps.length} modulepreload hint(s) in ${changed} page(s)`);
}

/** Path a page is served at (used to bake the active nav item). */
function pagePath(rel: string): string {
  const page = htmlPage(rel);
  if (page) return page.path;
  // Unregistered HTML (e.g. a generated artifact copy) keeps the generic rule
  // instead of failing a build that only mirrors an already-built page.
  if (rel === "index.html") return "/";
  if (rel === "zh/index.html") return "/zh/";
  if (rel.endsWith("/index.html")) return "/" + rel.slice(0, -"index.html".length);
  return "/" + rel;
}

/** Ensure every <main> has the skip-link target id + programmatic focus. */
function ensureMainTarget(html: string): string {
  return html.replace(/<main\b([^>]*)>/, (full, attrs: string) => {
    let next = attrs;
    if (!/\bid=/.test(next)) next += ' id="main"';
    else next = next.replace(/\bid="[^"]*"/, 'id="main"');
    if (!/\btabindex=/.test(next)) next += ' tabindex="-1"';
    return "<main" + next + ">";
  });
}

/**
 * B6: the nav/footer scripts are classic parser-inserted scripts. Loaded
 * synchronously in the body they block HTML parsing for one full round trip
 * each (600 ms at 300 ms RTT), which delays DOMContentLoaded, the decoder's
 * early progress UI and the app module's script tag. `defer` keeps the same
 * execution order and DOM readiness (they still run before DOMContentLoaded)
 * but lets the parser continue.
 */
function deferShellScripts(): void {
  let changed = 0;
  for (const f of collectHtml(ROOT)) {
    const html = readFileSync(f, "utf8");
    let next = html.replace(
      /<script src="(\/assets\/js\/(?:nav|footer)\.js)(\?[^"]*)?"><\/script>/g,
      '<script src="$1$2" defer></script>',
    );
    // The decoder boot/watchdog scripts must start at navigation (they kick
    // the wasm prefetch and the 15 s init clock) but must not block HTML
    // parsing — async downloads them in parallel and runs them as soon as
    // they arrive, which is still before the deferred app module.
    next = next.replace(
      /<script src="(\/assets\/js\/(?:decoder-boot|decoder-watchdog)\.js)(\?[^"]*)?"><\/script>/g,
      '<script src="$1$2" async></script>',
    );
    if (next !== html) {
      writeFileSync(f, next);
      changed++;
    }
  }
  if (changed > 0)
    console.log(`shell: deferred nav/footer + async decoder boot in ${changed} page(s)`);
}

/** Render nav + footer into every page (crawlers / no-JS link coverage). */
function renderStaticShell(): void {
  const year = COPYRIGHT_YEAR;
  let changed = 0;
  const navStart = "<!-- shell:nav:start -->";
  const navEnd = "<!-- shell:nav:end -->";
  const footStart = "<!-- shell:footer:start -->";
  const footEnd = "<!-- shell:footer:end -->";
  const htmlFiles = collectHtml(ROOT);
  for (const f of htmlFiles) {
    const rel = relative(ROOT, f).split("\\").join("/");
    const registered = htmlPage(rel);
    const isZh = registered ? registered.locale === "zh" : rel.startsWith("zh/");
    const path = registered ? registered.path : pagePath(rel);
    const original = readFileSync(f, "utf8");
    let html = original;
    const navShell = renderNavShell({ isZh, path });
    const footerShell = renderFooterShell({ isZh, year, path });
    if (html.includes(navStart) && html.includes(navEnd)) {
      html = html.replace(new RegExp(navStart + "[\\s\\S]*?" + navEnd), navShell);
    } else {
      const anchor = html.indexOf('<script src="/assets/js/nav.js');
      if (anchor < 0) throw new Error(`no assets/js/nav.js anchor in ${rel}`);
      html = html.slice(0, anchor) + navShell + "\n    " + html.slice(anchor);
    }
    if (html.includes(footStart) && html.includes(footEnd)) {
      html = html.replace(new RegExp(footStart + "[\\s\\S]*?" + footEnd), footerShell);
    } else {
      const anchor = html.lastIndexOf("</body>");
      if (anchor < 0) throw new Error(`no </body> in ${rel}`);
      html = html.slice(0, anchor) + "    " + footerShell + "\n  " + html.slice(anchor);
    }
    html = ensureMainTarget(html);
    if (html !== original) {
      writeFileSync(f, html);
      changed++;
    }
  }
  console.log(
    `shell: static nav+footer rendered into ${htmlFiles.length} page(s) (${changed} updated)`,
  );
}

/** Sitemap: canonical routes from the page registry, priorities and hreflang pairs. */
function generateSitemap(): void {
  const ORIGIN = "https://ithmb-codec.dev";
  const urls: string[] = [];
  for (const route of ROUTES) {
    // The 404 pair is deliberately excluded by the registry (sitemap: null).
    if (!route.sitemap) continue;
    for (const locale of ["en", "zh"] as const) {
      const canonical = locale === "en" ? route.en : route.zh;
      if (!route.html[locale]) throw new Error(`sitemap: no source page for ${canonical}`);
      urls.push(
        "  <url>\n" +
          `    <loc>${ORIGIN}${canonical}</loc>\n` +
          `    <priority>${route.sitemap[locale]}</priority>\n` +
          `    <xhtml:link rel="alternate" hreflang="en" href="${ORIGIN}${route.en}"/>\n` +
          `    <xhtml:link rel="alternate" hreflang="zh" href="${ORIGIN}${route.zh}"/>\n` +
          `    <xhtml:link rel="alternate" hreflang="x-default" href="${ORIGIN}${route.en}"/>\n` +
          "  </url>",
      );
    }
  }
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n' +
    '        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    urls.join("\n") +
    "\n</urlset>\n";
  writeFileSync(join(ROOT, "sitemap.xml"), xml);
  console.log(`sitemap: ${urls.length} URLs`);
}

/**
 * `_redirects` (Cloudflare Pages): generated from the page registry's alias
 * redirects plus the legacy/wildcard rules in src/routes.ts, so the host rules
 * and the URL map can never disagree. The file is committed because the
 * artifact copies it; the build keeps it byte-identical (determinism gate).
 */
function generateRedirects(): void {
  const lines: string[] = [
    "# Generated by scripts/build.mts from the page registry in src/routes.ts.",
    "# Edit src/routes.ts and rebuild; do not hand-edit this file.",
    "",
    "# Force non-www (Cloudflare handles HTTPS)",
    "https://www.ithmb-codec.dev/* https://ithmb-codec.dev/:splat 301",
    "",
    "# Canonical page aliases (from src/routes.ts)",
  ];
  let count = 1; // the www rule above
  for (const route of ROUTES) {
    for (const locale of ["en", "zh"] as const) {
      for (const from of route.redirects?.[locale] ?? []) {
        lines.push(`${from} ${routePagePath(route.key, locale)} 301`);
        count++;
      }
    }
  }
  for (const group of LEGACY_REDIRECT_GROUPS) {
    lines.push("");
    lines.push("# " + group.comment);
    for (const rule of group.rules) {
      lines.push(`${rule.from} ${redirectTarget(rule.to)} 301`);
      count++;
    }
  }
  lines.push("");
  writeFileSync(join(ROOT, "_redirects"), lines.join("\n"));
  console.log(`redirects: ${count} rule(s) -> _redirects`);
}

/** Fail if any module import / font / locale URL is still unhashed. */
function assertHashedAssets(): void {
  const bad: string[] = [];
  const dir = join(ROOT, "ithmb-decoder");
  const GLUE = new Set(["ithmb_wasm.js", "ithmb_wasm_bg.js"]);
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".js")) continue;
    if (GLUE.has(name)) continue; // glue internals intentionally untouched
    const body = readFileSync(join(dir, name), "utf8");
    for (const m of body.matchAll(
      /(?:from|import)\s*\(?\s*["'](\.\/[^"']+?\.js)(\?[^"']*)?["']/g,
    )) {
      if (!m[2] || !/\?v=[0-9a-f]{8}/.test(m[2])) bad.push(name + ": import " + m[1]);
    }
    if (name === "i18n.js") {
      const pattern = /(["'])locales\/\1\s*\+\s*lang\s*\+\s*(["'])\.json\2[^;]*/g;
      for (const m of body.matchAll(pattern)) {
        if (!/\?v=[0-9a-f]{8}/.test(m[0])) bad.push("i18n.js: locale URL without ?v=");
      }
    }
  }
  // The wasm-pack glue import specifiers/keys must stay EXACTLY unhashed.
  const glue = readFileSync(join(dir, "ithmb_wasm.js"), "utf8");
  if (!glue.includes('from "./ithmb_wasm_bg.js"') || glue.includes("ithmb_wasm_bg.js?v=")) {
    bad.push("ithmb_wasm.js: wasm-pack import specifier must stay unhashed");
  }
  if (!glue.includes('"./ithmb_wasm_bg.js":')) {
    bad.push("ithmb_wasm.js: wasm import namespace key must stay unhashed");
  }
  const css = readFileSync(join(ROOT, "ithmb-decoder", "styles.css"), "utf8");
  for (const m of css.matchAll(
    /url\((["']?)([^"')]+?\.(?:woff2?|png|jpe?g|webp|avif|svg|ico))(\?[^"')]*)?\1\)/g,
  )) {
    if (!/\?v=[0-9a-f]{8}/.test(m[3] ?? "")) bad.push("styles.css: asset " + m[2]);
  }
  if (bad.length > 0) {
    console.error("asset hashes: unhashed module/font/locale reference(s):");
    for (const b of bad.slice(0, 30)) console.error("  " + b);
    process.exit(1);
  }
}

hashStylesheetAssets();
hashLocaleFiles();
hashModuleGraph();
injectModulePreload();
renderStaticShell();
deferShellScripts();
generateSitemap();
generateRedirects();
bumpCacheVersions();
assertCacheTokens();
assertHashedAssets();
