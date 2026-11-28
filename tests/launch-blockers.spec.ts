// Launch-blocker proof: CSP/watchdog/retry, mobile nav keyboard, direct URLs,
// results scrolling, 320 reflow and No-JS honesty.
import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { waitDecodeSettled } from "./helpers";

const FIX = path.join(__dirname, "fixtures");
const PAGES = [
  "/",
  "/zh/",
  "/ithmb-decoder/",
  "/zh/ithmb-decoder/",
  "/guide/how-to-open-ithmb-files",
  "/zh/guide/how-to-open-ithmb-files",
  "/privacy/",
  "/zh/privacy/",
];

async function settled(page: Page, n: number): Promise<void> {
  await waitDecodeSettled(page, n);
}

test.describe("Launch blockers", () => {
  test("no CSP violations on the eight pages", async ({ page }) => {
    const violations: string[] = [];
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (e) => {
        (window as unknown as { __csp: string[] }).__csp ??= [];
        (window as unknown as { __csp: string[] }).__csp.push(
          `${e.violatedDirective} ${e.blockedURI}`,
        );
      });
    });
    page.on("console", (m) => {
      if (m.type() === "error" && /content security policy/i.test(m.text()))
        violations.push(m.text());
    });
    for (const url of PAGES) {
      await page.goto(url, { waitUntil: "networkidle" });
      const inline = await page.evaluate(
        () => (window as unknown as { __csp?: string[] }).__csp ?? [],
      );
      expect(inline, `${url} securitypolicyviolation`).toEqual([]);
    }
    expect(violations).toEqual([]);
  });

  test("blocked app.js shows the watchdog panel; a fresh load recovers", async ({ page }) => {
    await page.route("**/ithmb-decoder/app.js*", (route) => route.abort());
    await page.goto("/ithmb-decoder/", { waitUntil: "domcontentloaded" });
    const panel = page.locator("#loadFailed");
    await expect(panel).toBeVisible({ timeout: 20000 });
    await expect(panel.locator(".load-failed__title")).toContainText(/didn't load/i);
    await page.unroute("**/ithmb-decoder/app.js*");
    // WebKit keeps an aborted module script in that page's module cache, so a
    // same-page reload cannot re-request app.js (reproduced at f37fb2f). A fresh
    // page is the cross-engine equivalent of the user's reload for this check.
    const fresh = await page.context().newPage();
    try {
      await fresh.goto("/ithmb-decoder/", { waitUntil: "networkidle" });
      await expect(fresh.locator("#loadFailed")).toHaveCount(0);
      await expect
        .poll(() =>
          fresh.evaluate(
            () => (window as unknown as { IthmbDecoderReady?: boolean }).IthmbDecoderReady,
          ),
        )
        .toBe(true);
    } finally {
      await fresh.close();
    }
  });

  test("blocked WASM: one panel, Retry fully recovers and drains queued files", async ({
    page,
  }) => {
    await page.route("**/*.wasm*", (route) => route.abort());
    await page.goto("/ithmb-decoder/", { waitUntil: "domcontentloaded" });
    await page.setInputFiles("#fileInput", [path.join(FIX, "test1.ithmb")]);
    const panel = page.locator("#loadFailed");
    await expect(panel).toBeVisible({ timeout: 20000 });
    expect(await page.locator("#loadFailed").count()).toBe(1);
    await page.unroute("**/*.wasm*");
    await panel.locator(".load-failed__retry").click();
    await expect(page.locator("#loadFailed")).toHaveCount(0, { timeout: 15000 });
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { IthmbDecoderReady?: boolean }).IthmbDecoderReady,
        ),
      )
      .toBe(true);
    await settled(page, 1);
    await expect(page.locator(".file-card")).toHaveCount(1);
    await expect(page.locator(".file-card .status.err")).toHaveCount(0);
    await expect(page.locator("#decoding")).toBeHidden();
  });

  test("mobile drawer is keyboard operable with scrim and Escape", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "networkidle" });
    await page.locator("#navToggle").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("body")).toHaveClass(/nav-open/);
    await expect(page.locator(".nav-scrim")).toHaveClass(/is-on/);
    await expect(page.locator("#topNavPanel a").first()).toBeFocused();
    // Tab stays inside the panel.
    const first = page.locator("#topNavPanel a").first();
    for (let i = 0; i < 8; i++) await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => {
      const panel = document.getElementById("topNavPanel")!;
      return panel.contains(document.activeElement);
    });
    expect(inside).toBe(true);
    await page.keyboard.press("Escape");
    await expect(page.locator("body")).not.toHaveClass(/nav-open/);
    await expect(page.locator("#navToggle")).toBeFocused();
    void first;
  });

  test("direct URLs win; footer language link is the current page counterpart", async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem("ithmbLang", "en"));
    await page.goto("/zh/privacy/", { waitUntil: "networkidle" });
    expect(new URL(page.url()).pathname).toBe("/zh/privacy/");
    const footerLang = page.locator(".site-footer__lang");
    await expect(footerLang).toHaveAttribute("href", "/privacy/");
  });

  test("small mobile batches page-scroll; large batches get a bounded region + hint", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/ithmb-decoder/", { waitUntil: "networkidle" });
    await page.setInputFiles(
      "#fileInput",
      Array.from({ length: 8 }, (_, i) => path.join(FIX, `test${i + 1}.ithmb`)),
    );
    await settled(page, 8);
    const small = await page.evaluate(() => {
      const g = document.getElementById("file-list")!;
      return {
        overflow: getComputedStyle(g).overflowY,
        maxHeight: getComputedStyle(g).maxHeight,
        many: document.body.classList.contains("results-many"),
      };
    });
    expect(small.many).toBe(false);
    expect(small.maxHeight).toBe("none");

    await page.setInputFiles(
      "#fileInput",
      Array.from({ length: 30 }, (_, i) => ({
        name: `many-${i}.ithmb`,
        mimeType: "application/octet-stream",
        buffer: fs.readFileSync(path.join(FIX, "test1.ithmb")),
      })),
    );
    await settled(page, 30);
    const large = await page.evaluate(() => {
      const g = document.getElementById("file-list")!;
      const hint = document.getElementById("resultsWindowHint")!;
      return {
        many: document.body.classList.contains("results-many"),
        bounded: g.scrollHeight > g.clientHeight,
        hint: hint.textContent,
        hintHidden: hint.hidden,
      };
    });
    expect(large.many).toBe(true);
    expect(large.bounded).toBe(true);
    expect(large.hintHidden).toBe(false);
    expect(large.hint).toContain("38");
  });

  test("320 reflow: 20px gutter, select inside card, no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto("/ithmb-decoder/", { waitUntil: "networkidle" });
    await page.setInputFiles("#fileInput", [path.join(FIX, "uyvy.ithmb")]);
    await settled(page, 1);
    const m = await page.evaluate(() => {
      const card = document.querySelector(".file-card")!;
      const sel = document.querySelector<HTMLSelectElement>(".file-card select.fmt-select")!;
      const head = document.querySelector(".results-head h2")!.getBoundingClientRect();
      return {
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        gutter: Math.round(head.left),
        selectRight: Math.round(sel.getBoundingClientRect().right),
        cardRight: Math.round(card.getBoundingClientRect().right),
      };
    });
    expect(m.scrollWidth).toBeLessThanOrEqual(m.innerWidth + 1);
    expect(m.gutter).toBeGreaterThanOrEqual(18);
    expect(m.selectRight).toBeLessThanOrEqual(m.cardRight + 1);
  });

  test("No-JS decoder shows the notice beside an inert drop card", async ({ browser }) => {
    const ctx = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 390, height: 844 },
    });
    const page = await ctx.newPage();
    await page.goto("/ithmb-decoder/", { waitUntil: "load" });
    await expect(page.locator(".nojs-notice")).toBeVisible();
    const inert = await page
      .locator("#dropzone")
      .evaluate((el) => getComputedStyle(el).pointerEvents);
    expect(inert).toBe("none");
    await ctx.close();
  });
});
