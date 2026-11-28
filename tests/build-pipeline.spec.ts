// Tier B2 — build pipeline guarantees: static shell, generated sitemap,
// content-hashed asset URLs.
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { ROUTES } from "../src/routes";

const ROOT = path.join(__dirname, "..");
const ORIGIN = "https://ithmb-codec.dev";

const PAGES = [
  "index.html",
  "zh/index.html",
  "ithmb-decoder/index.html",
  "zh/ithmb-decoder/index.html",
  "guide/how-to-open-ithmb-files.html",
  "zh/guide/how-to-open-ithmb-files.html",
  "privacy/index.html",
  "zh/privacy/index.html",
  "third-party-notices.html",
  "zh/third-party-notices.html",
  "404.html",
  "zh/404.html",
];

function sliceBetween(html: string, start: RegExp, end: RegExp): string {
  const s = html.search(start);
  if (s < 0) return "";
  const rest = html.slice(s);
  const e = rest.search(end);
  return e < 0 ? rest : rest.slice(0, e + 8);
}

test.describe("Static shell in raw HTML (no JS)", () => {
  test("every page ships exactly one nav, footer and skip link with links", () => {
    for (const page of PAGES) {
      const html = fs.readFileSync(path.join(ROOT, page), "utf8");
      expect(html.split('class="top-nav"').length - 1, `${page}: nav count`).toBe(1);
      expect(html.split('class="site-footer"').length - 1, `${page}: footer count`).toBe(1);
      expect(html.split('class="skip-link"').length - 1, `${page}: skip link`).toBe(1);
      const nav = sliceBetween(html, /<nav class="top-nav"/, /<\/nav>/);
      const footer = sliceBetween(html, /<footer class="site-footer"/, /<\/footer>/);
      expect((nav.match(/<a /g) ?? []).length, `${page}: nav links`).toBeGreaterThanOrEqual(4);
      expect((footer.match(/<a /g) ?? []).length, `${page}: footer links`).toBeGreaterThanOrEqual(
        10,
      );
      // Skip-link target exists in the raw markup, not only after JS runs.
      expect(html, `${page}: main#main`).toMatch(/<main[^>]*\bid="main"/);
    }
  });

  test("localised shell copy follows the locale tree", () => {
    const en = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    const zh = fs.readFileSync(path.join(ROOT, "zh/index.html"), "utf8");
    expect(en).toContain('class="top-nav-link active" aria-current="page" data-nav-id="home"');
    expect(zh).toContain("首页");
    expect(zh).toContain('href="/zh/ithmb-decoder/"');
    expect(zh).toContain("版权所有 ©");
    expect(en).toContain("Copyright ©");
  });

  test("runtime scripts bind to the shell instead of duplicating it (JS on)", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("nav.top-nav")).toHaveCount(1);
    await expect(page.locator("footer.site-footer")).toHaveCount(1);
    await expect(page.locator(".skip-link")).toHaveCount(1);
    // Both copies of the shell markers stay in the DOM (idempotent build).
    const markers = await page.evaluate(
      () => (document.documentElement.innerHTML.match(/shell:nav:start/g) ?? []).length,
    );
    expect(markers).toBe(1);
  });

  test("no-JS visitors get the full shell and a working skip link", async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page.locator("nav.top-nav")).toBeVisible();
    await expect(page.locator("footer.site-footer")).toBeVisible();
    const navLinks = await page.locator(".top-nav a").count();
    const footerLinks = await page.locator(".site-footer a").count();
    expect(navLinks).toBeGreaterThanOrEqual(4);
    expect(footerLinks).toBeGreaterThanOrEqual(10);
    const skip = page.locator(".skip-link");
    await expect(skip).toHaveAttribute("href", "#main");
    await ctx.close();
  });
});

test.describe("Deploy artifact hygiene", () => {
  const site = path.join(ROOT, "_site");

  test("does not ship authored CSS layers or retired files", () => {
    expect(fs.existsSync(path.join(site, "ithmb-decoder", "css"))).toBe(false);
    for (const rel of [
      "maskable-512.png",
      "lang-redirect.js",
      "guide/decoder-failed-en.webp",
      "guide/decoder-failed-zh.webp",
    ]) {
      expect(fs.existsSync(path.join(site, rel)), rel).toBe(false);
    }
    // File-layout guard: generated classic scripts live under /assets/js/ in
    // the artifact and never at the repo or artifact root, and every page's
    // script src points at a file that actually exists.
    for (const rel of [
      "nav.js",
      "footer.js",
      "theme.js",
      "decoder-boot.js",
      "decoder-watchdog.js",
      "404-lang.js",
      "lang-redirect.js",
    ]) {
      expect(fs.existsSync(path.join(ROOT, rel)), `${rel} at repo root`).toBe(false);
      expect(fs.existsSync(path.join(site, rel)), `${rel} in _site root`).toBe(false);
    }
    for (const rel of PAGES) {
      const html = fs.readFileSync(path.join(ROOT, rel), "utf8");
      for (const m of html.matchAll(/<script src="(\/assets\/js\/[^"]+)"/g)) {
        const ref = (m[1] ?? "").split("?")[0] ?? "";
        expect(fs.existsSync(path.join(ROOT, ref)), `${rel}: ${ref}`).toBe(true);
      }
    }
  });
});

test.describe("Generated sitemap", () => {
  const xml = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1] ?? "");

  test("matches the shared route table (canonical URLs, no 404s)", () => {
    const expected = ROUTES.filter((r) => r.en !== "/404.html").flatMap((r) => [
      ORIGIN + r.en,
      ORIGIN + r.zh,
    ]);
    expect([...locs].sort()).toEqual([...expected].sort());
    // The notices pair is first-class now: both language URLs, no orphan extra.
    expect(locs).toContain(ORIGIN + "/third-party-notices");
    expect(locs).toContain(ORIGIN + "/zh/third-party-notices");
    expect(locs).toHaveLength(10);
    expect(locs.some((u) => /404/.test(u))).toBe(false);
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
  });

  test("has hreflang alternates for every pair", () => {
    for (const route of ROUTES.filter((r) => r.en !== "/404.html")) {
      const block = [...xml.matchAll(/<url>[\s\S]*?<\/url>/g)].find((m) =>
        m[0].includes(`<loc>${ORIGIN}${route.en}</loc>`),
      )?.[0];
      expect(block, route.en).toBeTruthy();
      expect(block).toContain(`hreflang="en" href="${ORIGIN}${route.en}"`);
      expect(block).toContain(`hreflang="zh" href="${ORIGIN}${route.zh}"`);
      expect(block).toContain(`hreflang="x-default" href="${ORIGIN}${route.en}"`);
    }
  });

  test("every sitemap URL returns 200", async ({ request }) => {
    for (const url of locs) {
      const res = await request.get(url.replace(ORIGIN, ""));
      expect(res.status(), url).toBe(200);
    }
  });
});

test.describe("Static copyright year", () => {
  test("one fixed constant owns the year (no runtime clock)", () => {
    const shell = fs.readFileSync(path.join(ROOT, "src/shell.ts"), "utf8");
    expect(shell).toMatch(/export const COPYRIGHT_YEAR = 2026;/);
    // The two consumers must read the constant, not the machine clock: a
    // clock read here made the static pages and the JS fallback drift apart
    // whenever the build ran across a year boundary.
    for (const rel of ["src/footer.ts", "scripts/build.mts"]) {
      const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
      expect(src, `${rel}: runtime clock`).not.toMatch(/getFullYear\s*\(/);
      expect(src, `${rel}: constant`).toContain("COPYRIGHT_YEAR");
    }
  });

  test("every built page carries the fixed 2026 notice", () => {
    for (const page of PAGES) {
      const html = fs.readFileSync(path.join(ROOT, page), "utf8");
      const zh = page.startsWith("zh/");
      expect(html, `${page}: notice`).toContain(
        zh ? "版权所有 © 2026 Nami" : "Copyright © 2026 Nami",
      );
      expect(html, `${page}: no other year`).not.toMatch(/© (?!2026)\d{4}/);
    }
  });
});

test.describe("Content-hashed assets", () => {
  test("HTML references only hashed local assets", () => {
    const asset = /\.(?:js|css|png|jpe?g|webp|avif|svg|ico|woff2?|json|wasm)$/;
    for (const page of PAGES) {
      const html = fs.readFileSync(path.join(ROOT, page), "utf8");
      for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
        const ref = m[1] ?? "";
        if (!ref.startsWith("/") || ref.startsWith("//")) continue;
        const clean = ref.split("?")[0] ?? ref;
        if (!asset.test(clean)) continue;
        expect(ref, `${page}: ${ref}`).toMatch(/\?v=[0-9a-f]{8}$/);
      }
    }
  });

  test("module imports, fonts and locale JSON are content-hashed", () => {
    // wasm-pack glue is hashed by content but never rewritten (the binary's
    // import namespace keys must match its import specifiers byte-for-byte).
    const GLUE = new Set(["ithmb_wasm.js", "ithmb_wasm_bg.js"]);
    for (const name of fs.readdirSync(path.join(ROOT, "ithmb-decoder"))) {
      if (!name.endsWith(".js")) continue;
      if (GLUE.has(name)) continue;
      const body = fs.readFileSync(path.join(ROOT, "ithmb-decoder", name), "utf8");
      for (const m of body.matchAll(
        /(?:from|import)\s*\(?\s*["'](\.\/[^"']+?\.js)(\?[^"']*)?["']/g,
      )) {
        expect(m[2] ?? "", `${name}: import ${m[1]}`).toMatch(/\?v=[0-9a-f]{8}/);
      }
    }
    const css = fs.readFileSync(path.join(ROOT, "ithmb-decoder/styles.css"), "utf8");
    for (const m of css.matchAll(/url\(([^)]*\.woff2[^)]*)\)/g)) {
      expect(m[1], "font URL").toMatch(/\?v=[0-9a-f]{8}/);
    }
    const i18n = fs.readFileSync(path.join(ROOT, "ithmb-decoder/i18n.js"), "utf8");
    // The built module is minified, so whitespace around the concatenation is
    // optional; the hashed locale URL itself is what matters.
    expect(i18n).toMatch(
      /(["'])locales\/\1\s*\+\s*lang\s*\+\s*(["'])\.json\2\s*\+\s*\(lang === "zh"/,
    );
  });
});
