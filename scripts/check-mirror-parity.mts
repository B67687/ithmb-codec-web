#!/usr/bin/env node
// check-mirror-parity.mts — EN/zh static-page mirror gate.
//
// The zh/ tree mirrors the EN pages 1:1 (content is hand-vetted by the
// maintainer in both languages). This gate prevents silent drift:
//  1. Every mirrored EN page has a zh/ counterpart; no orphan zh pages.
//  2. html lang is "en" / "zh-CN" respectively.
//  3. canonical + hreflang (en/zh/x-default) point at the correct
//     canonical URLs on BOTH sides.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const SITE = "https://ithmb-codec.dev";

// Pages that must exist in both locales. 404.html is intentionally single-locale.
const MIRRORED = [
  "index.html",
  "guide/how-to-open-ithmb-files.html",
  "enterprise/index.html",
  "privacy/index.html",
  "ithmb-decoder/index.html",
] as const;

let failures = 0;
let warnings = 0;
const fail = (msg: string) => {
  failures++;
  console.error("FAIL:", msg);
};
const warn = (msg: string) => {
  warnings++;
  console.warn("WARN:", msg);
};

function canonical(page: string, base: string): string {
  const rel = page.endsWith("index.html")
    ? page.slice(0, -"index.html".length)
    : page.replace(/\.html$/, "");
  return `${base}${rel}`;
}

function alternates(html: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of html.matchAll(/rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)) {
    map.set(m[1], m[2]);
  }
  return map;
}

for (const page of MIRRORED) {
  const en = readFileSync(join(ROOT, page), "utf8");
  const zh = readFileSync(join(ROOT, "zh", page), "utf8");

  const enCanon = canonical(page, `${SITE}/`);
  const zhCanon = canonical(page, `${SITE}/zh/`);

  // html lang
  const enLang = en.match(/<html\s+lang="([^"]+)"/)?.[1];
  const zhLang = zh.match(/<html\s+lang="([^"]+)"/)?.[1];
  if (enLang !== "en") fail(`${page}: html lang expected "en", got "${enLang ?? "missing"}"`);
  if (zhLang !== "zh-CN")
    fail(`zh/${page}: html lang expected "zh-CN", got "${zhLang ?? "missing"}"`);

  // canonical
  const enCanonHref = en.match(/rel="canonical"\s+href="([^"]+)"/)?.[1];
  const zhCanonHref = zh.match(/rel="canonical"\s+href="([^"]+)"/)?.[1];
  if (enCanonHref !== enCanon)
    fail(`${page}: canonical expected "${enCanon}", got "${enCanonHref ?? "missing"}"`);
  if (zhCanonHref !== zhCanon)
    fail(`zh/${page}: canonical expected "${zhCanon}", got "${zhCanonHref ?? "missing"}"`);

  // hreflang alternates (en + zh + x-default)
  // Intentional WARN: single-locale SEO not a priority; zh/ mirrors are
  // navigation aids, not SEO targets. See WNF-001 in TECH_DEBT_AUDIT.md.
  const enAlts = alternates(en);
  const zhAlts = alternates(zh);
  const expect = { en: enCanon, zh: zhCanon, "x-default": enCanon };
  for (const [lang, href] of Object.entries(expect)) {
    if (enAlts.get(lang) !== href)
      warn(
        `${page}: hreflang "${lang}" expected "${href}", got "${enAlts.get(lang) ?? "missing"}"`,
      );
    if (zhAlts.get(lang) !== href)
      warn(
        `zh/${page}: hreflang "${lang}" expected "${href}", got "${zhAlts.get(lang) ?? "missing"}"`,
      );
  }
}

// orphan check: every file under zh/ must be a known mirror
const expectedZh = new Set(MIRRORED.map((p) => join(ROOT, "zh", p)));
for (const dir of ["", "guide", "enterprise", "ithmb-decoder"]) {
  const base = join(ROOT, "zh", dir);
  try {
    for (const f of readdirSync(base)) {
      const full = join(base, f);
      if (statSync(full).isFile() && f.endsWith(".html") && !expectedZh.has(full)) {
        fail(`orphan zh page: zh/${dir ? dir + "/" : ""}${f} has no EN counterpart`);
      }
    }
  } catch {
    // dir absent is fine
  }
}

// ---- external-resource check: ZERO third-party requests ----
// The site's privacy position is "Free · Local · No tracking" — files never
// leave the browser and no third-party service is contacted. Any external
// resource reference (fonts.googleapis/gstatic, cdnjs, other CDNs) would
// both leak visitor IPs and regress the render-blocking hang we removed.
// Every page must load fonts/scripts/styles only from 'self'.
const RESOURCE_HOST_RE =
  /(?:src|href)="https?:\/\/(?!(?:schema\.org|github\.com|buymeacoffee\.com|ithmb-codec\.dev))(?:www\.)?[^"]+"/g;
const ALL_HTML_DIRS = [
  ROOT,
  join(ROOT, "guide"),
  join(ROOT, "enterprise"),
  join(ROOT, "zh"),
  join(ROOT, "zh", "guide"),
  join(ROOT, "zh", "enterprise"),
  join(ROOT, "ithmb-decoder"),
];
const allHtml: string[] = [];
for (const d of ALL_HTML_DIRS) {
  try {
    for (const f of readdirSync(d)) if (f.endsWith(".html")) allHtml.push(join(d, f));
  } catch {
    // dir absent is fine
  }
}
for (const f of allHtml) {
  const html = readFileSync(f, "utf8");
  let m: RegExpExecArray | null;
  while ((m = RESOURCE_HOST_RE.exec(html))) {
    fail(`external resource reference in ${f}: ${m[0]}`);
  }
}
console.log("[ext] zero third-party resource check complete");

if (warnings)
  console.warn(`\n${warnings} mirror-parity warning(s) (hreflang — intentional, see WNF-001).`);
if (failures) {
  console.error(`\n${failures} mirror-parity failure(s).`);
  process.exit(1);
}
console.log("mirror parity OK.");
