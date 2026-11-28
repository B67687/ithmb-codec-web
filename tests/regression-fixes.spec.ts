// Regression fixes from work/BEHAVIOR-REGRESSION-POSTLAUNCH.md.
import path from "node:path";
import { expect, test, type Page, type Route } from "@playwright/test";
import { waitDecodeSettled } from "./helpers";

const FIX = path.join(__dirname, "fixtures");
const file = (n: string) => path.join(FIX, n);

async function loadFiles(page: Page, names: string[]): Promise<void> {
  await page.goto("/ithmb-decoder/", { waitUntil: "networkidle" });
  await page.setInputFiles("#fileInput", names.map(file));
  await waitDecodeSettled(page, names.length);
}

/** Two animation frames: enough for media-query/style updates to settle. */
const nextFrames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );

test.describe("Post-launch behaviour regressions", () => {
  test("explicit theme choice stays pinned across real OS theme changes", async ({ browser }) => {
    const ctx = await browser.newContext({
      colorScheme: "light",
      viewport: { width: 1440, height: 900 },
    });
    const page = await ctx.newPage();
    await page.goto("/", { waitUntil: "networkidle" });
    const state = () =>
      page.evaluate(() => ({
        theme: document.documentElement.dataset.theme,
        pressed: document.getElementById("themeToggle")!.getAttribute("aria-pressed"),
        stored: localStorage.getItem("ithmbTheme"),
      }));
    expect(await state()).toEqual({ theme: "light", pressed: "false", stored: null });
    await page.locator("#themeToggle").click();
    expect(await state()).toEqual({ theme: "dark", pressed: "true", stored: "dark" });
    // Real sequential media transitions after the explicit choice.
    await page.emulateMedia({ colorScheme: "dark" });
    await nextFrames(page);
    await page.emulateMedia({ colorScheme: "light" });
    await nextFrames(page);
    expect(await state()).toEqual({ theme: "dark", pressed: "true", stored: "dark" });
    await page.reload({ waitUntil: "networkidle" });
    expect(await state()).toEqual({ theme: "dark", pressed: "true", stored: "dark" });
    await ctx.close();
  });

  test("OS theme changes are followed when localStorage throws", async ({ browser }) => {
    const ctx = await browser.newContext({
      colorScheme: "light",
      viewport: { width: 1440, height: 900 },
    });
    await ctx.addInitScript(() => {
      const boom = () => {
        throw new DOMException("storage blocked", "SecurityError");
      };
      Storage.prototype.getItem = boom;
      Storage.prototype.setItem = boom;
    });
    const page = await ctx.newPage();
    await page.goto("/", { waitUntil: "networkidle" });
    const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
    expect(await theme()).toBe("light");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(theme).toBe("dark");
    await page.emulateMedia({ colorScheme: "light" });
    await expect.poll(theme).toBe("light");
    await ctx.close();
  });

  test("viewer arrows work from keyboard, programmatic and mouse clicks exactly once", async ({
    page,
  }) => {
    await loadFiles(page, ["test1.ithmb", "test2.ithmb", "test3.ithmb"]);
    const pos = () => page.locator("#viewerPos");
    await expect(pos()).toHaveText("1 / 3");
    await page.locator("#nextBtn").focus();
    await page.keyboard.press("Enter");
    await expect(pos()).toHaveText("2 / 3");
    await page.keyboard.press(" ");
    await expect(pos()).toHaveText("3 / 3");
    await page.evaluate(() => document.getElementById("nextBtn")!.click());
    await expect(pos()).toHaveText("1 / 3");
    await page.locator("#nextBtn").click();
    await expect(pos()).toHaveText("2 / 3");
    // Prev through the same paths.
    await page.locator("#prevBtn").focus();
    await page.keyboard.press("Enter");
    await expect(pos()).toHaveText("1 / 3");
  });

  test("cancelling a drawer language dialog returns focus to a visible control", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loadFiles(page, ["test1.ithmb"]);
    await page.locator("#navToggle").click();
    await expect(page.locator("body")).toHaveClass(/nav-open/);
    await page.locator("#topNavPanel .nav-lang").click();
    const dialog = page.locator("#confirmDialog");
    await expect(dialog).toHaveClass(/active/);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toHaveClass(/active/);
    const focus = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return {
        id: el?.id || "",
        tag: el?.tagName || "",
        visible: !!el && el.offsetParent !== null,
        body: el === document.body,
      };
    });
    expect(focus.body).toBe(false);
    expect(focus.visible).toBe(true);
    expect(["navToggle", "langToggle"]).toContain(focus.id);
    await expect(page.locator(".file-card")).toHaveCount(1);
  });

  test("active Home in the mobile drawer closes and scrolls to top", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "networkidle" });
    await page.evaluate(() => window.scrollTo(0, 500));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(500);
    await page.locator("#navToggle").click();
    await expect(page.locator("body")).toHaveClass(/nav-open/);
    await page.locator('#topNavPanel .top-nav-link[data-nav-id="home"]').click();
    expect(new URL(page.url()).pathname).toBe("/");
    await expect(page.locator("body")).not.toHaveClass(/nav-open/);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });

  test("stalled-WASM Retry aborts the held request and starts a fresh one", async ({ page }) => {
    test.setTimeout(50000);
    let requests = 0;
    const held: Route[] = [];
    await page.route("**/*.wasm*", (route) => {
      requests++;
      if (requests === 1) {
        held.push(route);
        return; // held open: never fulfil
      }
      return route.continue();
    });
    await page.goto("/ithmb-decoder/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#loadFailed")).toBeVisible({ timeout: 25000 });
    const before = requests;
    await page.locator("#loadFailed button").click();
    await expect.poll(() => requests, { timeout: 8000 }).toBeGreaterThan(before);
    await expect
      .poll(
        () =>
          page.evaluate(
            () => (window as unknown as { IthmbDecoderReady?: boolean }).IthmbDecoderReady === true,
          ),
        { timeout: 15000 },
      )
      .toBe(true);
    await expect(page.locator("#loadFailed")).toHaveCount(0);
    for (const route of held) await route.abort().catch(() => {});
  });

  test("390 failure panel brings Retry into the viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route("**/ithmb-decoder/app.js*", (route) => route.abort());
    await page.goto("/ithmb-decoder/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#loadFailed")).toBeVisible({ timeout: 20000 });
    await expect
      .poll(() =>
        page.evaluate(() => {
          const btn = document.querySelector("#loadFailed button")!.getBoundingClientRect();
          return btn.top >= 0 && btn.bottom <= window.innerHeight;
        }),
      )
      .toBe(true);
  });

  test("zh failure panel uses the Chinese locale, not the English fallback", async ({ page }) => {
    // The failure body used to come from the embedded English defaults when
    // WASM failed before the locale JSON had landed. The panel must wait for
    // the active locale before rendering on a forced-language (/zh/) page.
    await page.route("**/*.wasm*", (route) => route.abort());
    await page.goto("/zh/ithmb-decoder/", { waitUntil: "domcontentloaded" });
    const panel = page.locator("#loadFailed");
    await expect(panel).toBeVisible({ timeout: 25000 });
    await expect(panel.locator(".load-failed__title")).toHaveText("解码器没加载出来");
    await expect(panel.locator(".load-failed__msg")).toContainText("网络");
    await expect(panel.locator(".load-failed__msg")).not.toContainText("Check your connection");
    await expect(panel.locator(".load-failed__retry")).toHaveText("重试");
  });

  test("third-party notices pair keeps the EN / 中 language controls", async ({ page }) => {
    // Desktop: the pill and the footer switch both point at the translation.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/third-party-notices.html", { waitUntil: "networkidle" });
    await expect(page.locator("#langToggle")).toBeVisible();
    await expect(page.locator("#langToggle")).toHaveAttribute("href", "/zh/third-party-notices");
    const footerLang = page.locator(".site-footer__lang");
    await expect(footerLang).toBeVisible();
    await expect(footerLang).toHaveAttribute("href", "/zh/third-party-notices");
    await expect(footerLang).toContainText("English · 中文");

    // The Chinese translation mirrors the control and links back to EN.
    await page.goto("/zh/third-party-notices.html", { waitUntil: "networkidle" });
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page.locator("#langToggle")).toHaveAttribute("href", "/third-party-notices");
    await expect(page.locator(".site-footer__lang")).toHaveAttribute(
      "href",
      "/third-party-notices",
    );

    // Mobile: the EN / 中 control lives in the drawer.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/third-party-notices.html", { waitUntil: "networkidle" });
    await page.locator("#navToggle").click();
    const drawerLang = page.locator(".nav-lang");
    await expect(drawerLang).toBeVisible();
    await expect(drawerLang).toHaveAttribute("href", "/zh/third-party-notices");
  });

  test("language switch navigates between the notices translations", async ({ page }) => {
    await page.goto("/third-party-notices.html", { waitUntil: "networkidle" });
    await page.locator("#langToggle").click();
    await page.waitForURL(/\/zh\/third-party-notices$/, { timeout: 10000 });
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page.locator("h1")).toHaveText("第三方声明");
  });
});
