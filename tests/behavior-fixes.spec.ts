// Behaviour fixes from work/BEHAVIOR-AUDIT.md (blocked app pill, language
// cancel, OS theme aria, drawer scroll lock, nav current state, copy).
import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { sampleAttribute, waitDecodeSettled, waitForScrollEnd } from "./helpers";

const FIX = path.join(__dirname, "fixtures");

async function loadOne(page: Page): Promise<void> {
  await page.goto("/ithmb-decoder/", { waitUntil: "networkidle" });
  await page.setInputFiles("#fileInput", [path.join(FIX, "test1.ithmb")]);
  await waitDecodeSettled(page, 1);
}

test.describe("Behaviour audit fixes", () => {
  test("blocked app.js: loading pill hides and Retry is hit-testable", async ({ page }) => {
    await page.route("**/ithmb-decoder/app.js*", (route) => route.abort());
    await page.goto("/ithmb-decoder/", { waitUntil: "domcontentloaded" });
    const panel = page.locator("#loadFailed");
    await expect(panel).toBeVisible({ timeout: 20000 });
    await expect(page.locator("#decoding")).toBeHidden();
    // elementFromPoint only sees the viewport; bring the Retry button into it.
    await panel.locator("button").scrollIntoViewIfNeeded();
    const hit = await page.evaluate(() => {
      const btn = document.querySelector<HTMLElement>("#loadFailed button");
      if (!btn) return { ok: false, reason: "no button" };
      const r = btn.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        ok: !!top && (top === btn || !!top.closest("#loadFailed button")),
        top: top?.id || top?.tagName || null,
        pillDisplay: document.getElementById("decoding")
          ? getComputedStyle(document.getElementById("decoding")!).display
          : "absent",
      };
    });
    expect(hit.ok, JSON.stringify(hit)).toBe(true);
  });

  test("cancelling the language dialog leaves ithmbLang untouched", async ({ page }) => {
    await loadOne(page);
    // No stored preference: cancel must not create one.
    await page.evaluate(() => localStorage.removeItem("ithmbLang"));
    await page.locator("#langToggle").click();
    const dialog = page.locator("#confirmDialog");
    await expect(dialog).toHaveClass(/active/);
    await dialog.locator('[data-confirm="cancel"]').click();
    await expect(dialog).not.toHaveClass(/active/);
    expect(await page.evaluate(() => localStorage.getItem("ithmbLang"))).toBeNull();

    // Escape path with an existing preference: unchanged.
    await page.evaluate(() => localStorage.setItem("ithmbLang", "en"));
    await page.locator("#langToggle").click();
    await expect(dialog).toHaveClass(/active/);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toHaveClass(/active/);
    expect(await page.evaluate(() => localStorage.getItem("ithmbLang"))).toBe("en");
    // URL unchanged and files kept.
    expect(await page.locator(".file-card").count()).toBe(1);

    // The footer language link uses the same confirmed path; cancel must not
    // write either (the footer must not persist on click).
    await page.evaluate(() => localStorage.setItem("ithmbLang", "en"));
    await page.locator(".site-footer__lang").click();
    await expect(dialog).toHaveClass(/active/);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toHaveClass(/active/);
    expect(await page.evaluate(() => localStorage.getItem("ithmbLang"))).toBe("en");
  });

  test("theme aria-pressed follows OS changes while no explicit choice exists", async ({
    browser,
  }) => {
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
      }));
    expect(await state()).toEqual({ theme: "light", pressed: "false" });
    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(state).toEqual({ theme: "dark", pressed: "true" });
    await page.emulateMedia({ colorScheme: "light" });
    await expect.poll(state).toEqual({ theme: "light", pressed: "false" });
    // An explicit choice pins the theme: OS changes no longer flip it.
    await page.locator("#themeToggle").click();
    expect(await state()).toEqual({ theme: "dark", pressed: "true" });
    await page.emulateMedia({ colorScheme: "light" });
    // The explicit choice unsubscribed the OS listener synchronously: no later
    // media event may flip the theme.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    expect(await state()).toEqual({ theme: "dark", pressed: "true" });
    await ctx.close();
  });

  test("drawer locks background scroll and restores it on every close path", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "networkidle" });
    await page.evaluate(() => window.scrollTo(0, 400));
    // The site uses smooth scrolling; wait for the offset to settle before
    // opening so navScrollY captures the intended 400.
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(400);
    await page.locator("#navToggle").click();
    await expect(page.locator("body")).toHaveClass(/nav-open/);
    await expect(page.locator("body")).toHaveClass(/nav-scroll-lock/);
    // The body is fixed at the previous offset, so the document scroll offset
    // is pinned (may be 0) and wheel must not move it.
    const scrollWhileOpen = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 600);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollWhileOpen);

    await page.keyboard.press("Escape");
    await expect(page.locator("body")).not.toHaveClass(/nav-open/);
    await expect(page.locator("body")).not.toHaveClass(/nav-scroll-lock/);
    // Exact restore of the pre-open offset.
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(400);
    await page.mouse.wheel(0, 400);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(400);

    // Scrim close path.
    await page.locator("#navToggle").click();
    await page.locator(".nav-scrim").click({ position: { x: 10, y: 300 } });
    await expect(page.locator("body")).not.toHaveClass(/nav-open/);
    // Resize above the breakpoint close path.
    await page.locator("#navToggle").click();
    await expect(page.locator("body")).toHaveClass(/nav-open/);
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(page.locator("body")).not.toHaveClass(/nav-open/);
    await expect(page.locator("body")).not.toHaveClass(/nav-scroll-lock/);
  });

  test("privacy and 404 pages have no false current nav item", async ({ page }) => {
    for (const url of ["/privacy/", "/404.html", "/zh/privacy/", "/zh/404.html"]) {
      await page.goto(url, { waitUntil: "networkidle" });
      const current = await page.$$eval(".top-nav-link[aria-current]", (els) => els.length);
      expect(current, url).toBe(0);
      expect(await page.locator(".top-nav-link.active").count(), url).toBe(0);
    }
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator('.top-nav-link[data-nav-id="home"]')).toHaveAttribute(
      "aria-current",
      "page",
    );
    await page.goto("/ithmb-decoder/", { waitUntil: "networkidle" });
    await expect(page.locator('.top-nav-link[data-nav-id="decoder"]')).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("results hint copy is non-contradictory (EN and ZH)", async ({ page }) => {
    const files = Array.from({ length: 13 }, (_, i) => ({
      name: `hint-${i}.ithmb`,
      mimeType: "application/octet-stream",
      buffer: fs.readFileSync(path.join(FIX, "test1.ithmb")),
    }));
    await page.goto("/ithmb-decoder/", { waitUntil: "networkidle" });
    await page.setInputFiles("#fileInput", files);
    await page.waitForFunction(
      () =>
        document.querySelectorAll(".file-card").length >= 13 &&
        document.querySelectorAll(".file-card .status.loading").length === 0,
      null,
      { timeout: 30000 },
    );
    const hint = await page.locator("#resultsWindowHint").innerText();
    expect(hint).toBe("Showing 13 images. Scroll inside the results to see them all.");
    expect(hint).not.toContain("Showing all");
    expect(hint).not.toContain("for the rest");

    await page.goto("/zh/ithmb-decoder/", { waitUntil: "networkidle" });
    await page.setInputFiles("#fileInput", files);
    await page.waitForFunction(
      () =>
        document.querySelectorAll(".file-card").length >= 13 &&
        document.querySelectorAll(".file-card .status.loading").length === 0,
      null,
      { timeout: 30000 },
    );
    expect(await page.locator("#resultsWindowHint").innerText()).toBe(
      "正在显示 13 张图。在下方结果区域内滚动可查看全部。",
    );
  });

  test("privacy TOC position rule tracks top, middle and bottom", async ({ page }) => {
    const active = () =>
      page.evaluate(
        () => document.querySelector(".privacy-toc__link.is-active")?.getAttribute("href") ?? null,
      );
    for (const [width, height] of [
      [1440, 900],
      [390, 844],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.goto("/privacy/", { waitUntil: "networkidle" });
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect.poll(active).toBe("#files");

      // Middle: scroll so the hosting section crosses the sticky-header line.
      await page.evaluate(() => {
        const el = document.getElementById("hosting")!;
        window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 60);
      });
      await expect.poll(active).toBe("#hosting");

      // Bottom: the last section must win even though the taller terms section
      // is still on screen (the old ratio-only rule chose #terms).
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expect.poll(active).toBe("#changes");
      const bottomState = await page.evaluate(() => ({
        y: window.scrollY,
        changesTop: Math.round(document.getElementById("changes")!.getBoundingClientRect().top),
        active: document.querySelector(".privacy-toc__link.is-active")?.getAttribute("href"),
      }));
      expect(bottomState.active).toBe("#changes");
      expect(bottomState.changesTop).toBeLessThan(bottomState.y + 900);

      // Click-to-changes still holds its clicked state while scrolling.
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect.poll(active).toBe("#files");
      await page.locator('.privacy-toc__link[href="#changes"]').click();
      await expect.poll(active).toBe("#changes");
      const seen = await sampleAttribute(page, ".privacy-toc__link.is-active", "href", 400);
      expect(seen.length).toBeGreaterThan(0);
      expect(seen.every((href) => href === "#changes")).toBe(true);
    }
  });

  test("privacy TOC never flickers back while a clicked link scrolls", async ({ page }) => {
    await page.goto("/privacy/", { waitUntil: "networkidle" });
    const active = () =>
      page.evaluate(
        () => document.querySelector(".privacy-toc__link.is-active")?.getAttribute("href") ?? null,
      );
    expect(await active()).toBe("#files");
    await page.locator('.privacy-toc__link[href="#changes"]').click();
    await expect.poll(active).toBe("#changes");
    const samples = await sampleAttribute(page, ".privacy-toc__link.is-active", "href", 400);
    expect(samples.length).toBeGreaterThan(0);
    // During the first ~400 ms of the smooth scroll the clicked item must stay
    // active; the old observer feedback bounced back to #files.
    expect(samples.every((href) => href === "#changes")).toBe(true);
    await waitForScrollEnd(page);
    expect(await active()).toBe("#changes");

    // Reduced motion: the anchor jump is immediate and the clicked state holds.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/privacy/", { waitUntil: "networkidle" });
    await page.locator('.privacy-toc__link[href="#hosting"]').click();
    await expect.poll(active).toBe("#hosting");
    const held = await sampleAttribute(page, ".privacy-toc__link.is-active", "href", 250);
    expect(held.length).toBeGreaterThan(0);
    expect(held.every((href) => href === "#hosting")).toBe(true);
  });

  test("privacy spells out EEA on first use in both languages", async ({ page }) => {
    await page.goto("/privacy/", { waitUntil: "networkidle" });
    await expect(page.locator("#rights")).toContainText(
      "In the European Economic Area (EEA), the UK or similar jurisdictions",
    );
    await page.goto("/zh/privacy/", { waitUntil: "networkidle" });
    await expect(page.locator("#rights")).toContainText("在欧洲经济区（EEA）、英国或类似地区");
  });
});
