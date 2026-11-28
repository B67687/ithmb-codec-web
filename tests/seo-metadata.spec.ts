// SEO metadata regression tests: localized meta descriptions, hreflang
// alternates, and CSP presence on every page. These guard against someone
// removing the meta tags or breaking the i18n wiring (data-i18n-content).
//
// Phase 3: the hreflang alternates now point at the real server-rendered
// /zh/ page tree (en ↔ zh real URLs plus x-default → English), replacing the
// old ?lang= client-side swap URLs. The 404 page is noindexed and has no zh
// counterpart, so it intentionally carries no hreflang links.
import { expect, test } from "@playwright/test";

const PAGES = [
  ["home", "/"],
  ["decoder", "/ithmb-decoder/"],
  ["guide", "/guide/how-to-open-ithmb-files.html"],
  ["notices", "/third-party-notices.html"],
  ["404", "/404.html"],
];

// Content pages with their canonical English and Chinese URLs (the guide's
// canonical is the extensionless path, matching sitemap.xml).
const CONTENT_PAGES = [
  ["home", "/", "https://ithmb-codec.dev/", "https://ithmb-codec.dev/zh/"],
  [
    "decoder",
    "/ithmb-decoder/",
    "https://ithmb-codec.dev/ithmb-decoder/",
    "https://ithmb-codec.dev/zh/ithmb-decoder/",
  ],
  [
    "guide",
    "/guide/how-to-open-ithmb-files.html",
    "https://ithmb-codec.dev/guide/how-to-open-ithmb-files",
    "https://ithmb-codec.dev/zh/guide/how-to-open-ithmb-files",
  ],
  [
    "notices",
    "/third-party-notices.html",
    "https://ithmb-codec.dev/third-party-notices",
    "https://ithmb-codec.dev/zh/third-party-notices",
  ],
];

const ZH_PAGES = [
  ["zh home", "/zh/", "https://ithmb-codec.dev/", "https://ithmb-codec.dev/zh/"],
  [
    "zh decoder",
    "/zh/ithmb-decoder/",
    "https://ithmb-codec.dev/ithmb-decoder/",
    "https://ithmb-codec.dev/zh/ithmb-decoder/",
  ],
  [
    "zh guide",
    "/zh/guide/how-to-open-ithmb-files.html",
    "https://ithmb-codec.dev/guide/how-to-open-ithmb-files",
    "https://ithmb-codec.dev/zh/guide/how-to-open-ithmb-files",
  ],
  [
    "zh notices",
    "/zh/third-party-notices.html",
    "https://ithmb-codec.dev/third-party-notices",
    "https://ithmb-codec.dev/zh/third-party-notices",
  ],
];

for (const [name, path] of PAGES) {
  if (path === undefined) throw new Error("bad page tuple");
  test.describe(`${name} SEO metadata`, () => {
    // Guards: meta description present (generated per page).
    test("has a meta description", async ({ page }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("nav");
      const content = await page.locator('meta[name="description"]').getAttribute("content");
      if (!content) throw new Error("missing meta description");
      expect(content.length).toBeGreaterThan(30);
    });
  });
}

test.describe("direct URLs win (no automatic language redirect)", () => {
  const baseURL = process.env.BASE_URL || "https://ithmb-codec.dev";

  // Guards: a stored preference never bounces a direct EN URL.
  test("stored zh preference leaves an EN page in English", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("ithmbLang", "zh"));
    await page.goto("/", { waitUntil: "networkidle" });
    expect(new URL(page.url()).pathname).toBe("/");
    await expect(page.locator("html")).toHaveAttribute("lang", /^en/i);
  });

  // Guards: a stored preference never bounces a direct /zh/ URL.
  test("stored en preference leaves a /zh/ page in Chinese", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("ithmbLang", "en"));
    await page.goto("/zh/", { waitUntil: "networkidle" });
    expect(new URL(page.url()).pathname).toBe("/zh/");
    await expect(page.locator("html")).toHaveAttribute("lang", /^zh/i);
  });

  // Guards: the guide .html URL is not rewritten to the locale-pretty URL.
  test("guide .html URL stays on its direct URL", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("ithmbLang", "zh"));
    await page.goto("/guide/how-to-open-ithmb-files.html", { waitUntil: "networkidle" });
    expect(new URL(page.url()).pathname).toBe("/guide/how-to-open-ithmb-files.html");
  });

  // Guards: no preference + zh browser does not auto-redirect an EN URL.
  test("no preference + zh browser keeps an EN page in place", async ({ browser }) => {
    const context = await browser.newContext({ locale: "zh-CN", baseURL });
    const page = await context.newPage();
    await page.goto("/", { waitUntil: "networkidle" });
    expect(new URL(page.url()).pathname).toBe("/");
    await expect(page.locator("html")).toHaveAttribute("lang", /^en/i);
    await context.close();
  });

  // Guards: /zh/ page never bounces to EN.
  test("zh browser stays on a /zh/ page", async ({ page }) => {
    await page.goto("/zh/", { waitUntil: "networkidle" });
    expect(new URL(page.url()).pathname).toBe("/zh/");
    await expect(page.locator("html")).toHaveAttribute("lang", /^zh/i);
  });

  // Guards: unmapped paths never redirect (404 stays put).
  test("an unmapped path is never redirected (404 stays put)", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("ithmbLang", "zh"));
    await page.goto("/404.html", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("nav");
    expect(new URL(page.url()).pathname).toBe("/404.html");
  });
});

test.describe("hreflang + canonical (real /zh/ URLs)", () => {
  for (const [name, path, enUrl, zhUrl] of CONTENT_PAGES) {
    if (path === undefined) throw new Error("bad page tuple");
    // Guards: hreflang alternates per page (generated).
    test(`${name}: en ↔ zh alternates with x-default to the English URL`, async ({ page }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("nav");
      const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
      if (canonical === null) throw new Error("missing canonical link");
      expect(canonical).toBe(enUrl);
      const links = await page.locator('link[rel="alternate"][hreflang]').evaluateAll((els) =>
        els.map((el) => ({
          lang: el.getAttribute("hreflang"),
          href: el.getAttribute("href"),
        })),
      );
      expect(links).toContainEqual({ lang: "en", href: enUrl });
      expect(links).toContainEqual({ lang: "zh", href: zhUrl });
      expect(links).toContainEqual({ lang: "x-default", href: enUrl });
      // The old ?lang= duplicate-URL scheme must not remain on any page.
      expect(await page.locator('link[href*="?lang="]').count()).toBe(0);
    });
  }
});

test.describe("Chinese /zh/ pages (server-rendered)", () => {
  for (const [name, path, enUrl, zhUrl] of ZH_PAGES) {
    if (path === undefined) throw new Error("bad page tuple");
    // Guards: fully-Chinese HTML + hreflang (generated).
    test(`${name}: fully Chinese HTML with real en ↔ zh hreflang`, async ({ page }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("nav");
      const htmlLang = await page.locator("html").getAttribute("lang");
      if (htmlLang === null) throw new Error("missing html lang");
      expect(htmlLang.toLowerCase().startsWith("zh")).toBe(true);
      const title = await page.title();
      expect(/[\u4e00-\u9fff]/.test(title)).toBe(true);
      const desc = await page.locator('meta[name="description"]').getAttribute("content");
      expect(/[\u4e00-\u9fff]/.test(desc!)).toBe(true);
      const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
      expect(canonical).toBe(zhUrl);
      const links = await page.locator('link[rel="alternate"][hreflang]').evaluateAll((els) =>
        els.map((el) => ({
          lang: el.getAttribute("hreflang"),
          href: el.getAttribute("href"),
        })),
      );
      expect(links).toContainEqual({ lang: "en", href: enUrl });
      expect(links).toContainEqual({ lang: "zh", href: zhUrl });
      expect(links).toContainEqual({ lang: "x-default", href: enUrl });
      expect(await page.locator('link[href*="?lang="]').count()).toBe(0);
      // The visible body content is Chinese — served statically, not swapped
      // in by JS (i18n.js forces zh on /zh/ pages, so this holds with or
      // without the module loaded).
      const bodyText = await page.locator("body").innerText();
      expect(/[\u4e00-\u9fff]/.test(bodyText)).toBe(true);
    });
  }
});

test.describe("Content Security Policy", () => {
  // Guards: CSP header on every page (localhost-skipped, see below).
  test("every page has a CSP header", async ({ request, baseURL }) => {
    // _headers is a Cloudflare Pages feature — local http-server does not
    // serve HTTP headers from it, so skip when running against localhost.
    if (baseURL && new URL(baseURL).hostname === "localhost") {
      test.skip();
      return;
    }
    for (const [, path] of PAGES.concat(ZH_PAGES)) {
      if (path === undefined) throw new Error("bad page tuple");
      const res = await request.get(path);
      const csp = res.headers()["content-security-policy"] || "";
      expect(csp, `${path} missing CSP header`).toContain("default-src 'self'");
    }
  });
});
