// SEO metadata regression tests: localized meta descriptions, hreflang
// alternates, and CSP presence on every page. These guard against someone
// removing the meta tags or breaking the i18n wiring (data-i18n-content).
//
// Phase 3: the hreflang alternates now point at the real server-rendered
// /zh/ page tree (en ↔ zh real URLs plus x-default → English), replacing the
// old ?lang= client-side swap URLs. The 404 page is noindexed and has no zh
// counterpart, so it intentionally carries no hreflang links.
import { test, expect } from "@playwright/test";

const PAGES = [
  ["home", "/"],
  ["decoder", "/ithmb-decoder/"],
  ["guide", "/guide/how-to-open-ithmb-files.html"],
  ["enterprise", "/enterprise/"],
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
    "enterprise",
    "/enterprise/",
    "https://ithmb-codec.dev/enterprise/",
    "https://ithmb-codec.dev/zh/enterprise/",
  ],
];

const ZH_PAGES = [
  [
    "zh home",
    "/zh/",
    "https://ithmb-codec.dev/",
    "https://ithmb-codec.dev/zh/",
  ],
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
    "zh enterprise",
    "/zh/enterprise/",
    "https://ithmb-codec.dev/enterprise/",
    "https://ithmb-codec.dev/zh/enterprise/",
  ],
];

for (const [name, path] of PAGES) {
  if (path === undefined) throw new Error("bad page tuple");
  test.describe(`${name} SEO metadata`, () => {
    test("has a meta description", async ({ page }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      const content = await page
        .locator('meta[name="description"]')
        .getAttribute("content");
      if (!content) throw new Error("missing meta description");
      expect(content.length).toBeGreaterThan(30);
    });
  });
}

test.describe("language preference redirect", () => {
  const baseURL = process.env.BASE_URL || "https://ithmb-codec.dev";

  test("stored zh preference redirects an EN page to its /zh/ counterpart", async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem("ithmbLang", "zh"));
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => location.pathname === "/zh/");
    await expect(page.locator("html")).toHaveAttribute("lang", /^zh/i);
    const desc = await page
      .locator('meta[name="description"]')
      .getAttribute("content");
    expect(/[\u4e00-\u9fff]/.test(desc!)).toBe(true);
  });

  test("stored zh preference redirects the guide .html URL to the zh guide", async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem("ithmbLang", "zh"));
    await page.goto("/guide/how-to-open-ithmb-files.html", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForFunction(
      () => location.pathname === "/zh/guide/how-to-open-ithmb-files",
    );
    await expect(page.locator("html")).toHaveAttribute("lang", /^zh/i);
  });

  test("stored en preference redirects a /zh/ page to its EN counterpart", async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem("ithmbLang", "en"));
    await page.goto("/zh/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => location.pathname === "/");
    await expect(page.locator("html")).toHaveAttribute("lang", /^en/i);
    const desc = await page
      .locator('meta[name="description"]')
      .getAttribute("content");
    expect(/[\u4e00-\u9fff]/.test(desc!)).toBe(false);
  });

  test("no preference + non-zh browser keeps an EN page in place", async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.removeItem("ithmbLang"));
    await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(new URL(page.url()).pathname).toBe("/");
    const htmlLang = await page.locator("html").getAttribute("lang");
    expect(htmlLang!.toLowerCase().startsWith("en")).toBe(true);
    const desc = await page
      .locator('meta[name="description"]')
      .getAttribute("content");
    expect(/[\u4e00-\u9fff]/.test(desc!)).toBe(false);
  });

  test("no preference + zh browser redirects an EN page to /zh/", async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: "zh-CN", baseURL });
    const page = await context.newPage();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => location.pathname === "/zh/");
    await expect(page.locator("html")).toHaveAttribute("lang", /^zh/i);
    await context.close();
  });

  test("no preference + zh browser stays on a /zh/ page (never bounces to EN)", async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: "zh-CN", baseURL });
    const page = await context.newPage();
    await page.goto("/zh/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(300); // give any (wrong) redirect time to fire
    expect(new URL(page.url()).pathname).toBe("/zh/");
    const htmlLang = await page.locator("html").getAttribute("lang");
    expect(htmlLang!.toLowerCase().startsWith("zh")).toBe(true);
    await context.close();
  });

  test("an unmapped path is never redirected (404 stays put)", async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem("ithmbLang", "zh"));
    await page.goto("/404.html", { waitUntil: "domcontentloaded" });
    expect(new URL(page.url()).pathname).toBe("/404.html");
  });
});

test.describe("hreflang + canonical (real /zh/ URLs)", () => {
  for (const [name, path, enUrl, zhUrl] of CONTENT_PAGES) {
    if (path === undefined) throw new Error("bad page tuple");
    test(`${name}: en ↔ zh alternates with x-default to the English URL`, async ({
      page,
    }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      const canonical = await page
        .locator('link[rel="canonical"]')
        .getAttribute("href");
      if (canonical === null) throw new Error("missing canonical link");
      expect(canonical).toBe(enUrl);
      const links = await page
        .locator('link[rel="alternate"][hreflang]')
        .evaluateAll((els) =>
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
    test(`${name}: fully Chinese HTML with real en ↔ zh hreflang`, async ({
      page,
    }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      const htmlLang = await page.locator("html").getAttribute("lang");
      if (htmlLang === null) throw new Error("missing html lang");
      expect(htmlLang.toLowerCase().startsWith("zh")).toBe(true);
      const title = await page.title();
      expect(/[\u4e00-\u9fff]/.test(title)).toBe(true);
      const desc = await page
        .locator('meta[name="description"]')
        .getAttribute("content");
      expect(/[\u4e00-\u9fff]/.test(desc!)).toBe(true);
      const canonical = await page
        .locator('link[rel="canonical"]')
        .getAttribute("href");
      expect(canonical).toBe(zhUrl);
      const links = await page
        .locator('link[rel="alternate"][hreflang]')
        .evaluateAll((els) =>
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
