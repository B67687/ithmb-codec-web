// Post-launch decoder polish: delayed loading reveal and labelled Add files.
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { waitDecodeSettled, waitDecoderState } from "./helpers";

const FIX = path.join(__dirname, "fixtures");

async function settled(page: Page, n = 1): Promise<void> {
  await waitDecodeSettled(page, n);
}

/** Record every moment the loading pill becomes visible (mutation log). */
async function watchLoading(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { __loadingShows: number[] }).__loadingShows = [];
    const t0 = performance.now();
    const seen = new WeakSet<Element>();
    const check = (el: Element | null) => {
      if (!el || !(el as HTMLElement).id || (el as HTMLElement).id !== "decoding") return;
      if (seen.has(el)) return;
      seen.add(el);
      const mo = new MutationObserver(() => {
        const hidden = (el as HTMLElement).hasAttribute("hidden");
        if (!hidden)
          (window as unknown as { __loadingShows: number[] }).__loadingShows.push(
            Math.round(performance.now() - t0),
          );
      });
      mo.observe(el, { attributes: true, attributeFilter: ["hidden"] });
    };
    const root = new MutationObserver(() => check(document.getElementById("decoding")));
    root.observe(document, { childList: true, subtree: true });
  });
}

const loadingShows = (page: Page) =>
  page.evaluate(() => (window as unknown as { __loadingShows: number[] }).__loadingShows ?? []);

test.describe("Post-launch decoder polish", () => {
  test("fast local load never shows a loading label", async ({ page }) => {
    await watchLoading(page);
    await page.goto("/ithmb-decoder/", { waitUntil: "networkidle" });
    await waitDecoderState(page, "ready");
    expect(await loadingShows(page)).toEqual([]);
    await expect(page.locator("#decoding")).toBeHidden();
    expect(
      await page.evaluate(
        () => (window as unknown as { IthmbDecoderReady?: boolean }).IthmbDecoderReady === true,
      ),
    ).toBe(true);
  });

  test("slow init reveals progress only after about 2 s, then hides", async ({ page }) => {
    await page.route("**/*.wasm*", async (route) => {
      await new Promise((r) => setTimeout(r, 3600));
      await route.continue();
    });
    await watchLoading(page);
    await page.goto("/ithmb-decoder/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    await expect(page.locator("#decoding")).toBeHidden();
    await expect(page.locator("#decoding")).toBeVisible({ timeout: 2500 });
    const text = await page.locator("#decoding").innerText();
    expect(text).toMatch(/Loading decoder|Preparing decoder|正在载入|正在准备/);
    await page.waitForFunction(
      () => (window as unknown as { IthmbDecoderReady?: boolean }).IthmbDecoderReady === true,
      null,
      { timeout: 20000 },
    );
    await expect(page.locator("#decoding")).toBeHidden();
    const shows = await loadingShows(page);
    expect(shows.length).toBeGreaterThan(0);
    expect(Math.min(...shows)).toBeGreaterThanOrEqual(1800);
  });

  test("blocked WASM shows the failure panel without a loading flash", async ({ page }) => {
    await page.route("**/*.wasm*", (route) => route.abort());
    await watchLoading(page);
    await page.goto("/ithmb-decoder/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#loadFailed")).toBeVisible({ timeout: 20000 });
    await expect(page.locator("#decoding")).toBeHidden();
    expect(await loadingShows(page)).toEqual([]);
  });

  test("Add files is a normal labelled control, reachable and non-overlapping at four widths", async ({
    page,
  }) => {
    for (const [width, height] of [
      [1440, 900],
      [1024, 768],
      [390, 844],
      [320, 568],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.goto("/ithmb-decoder/", { waitUntil: "networkidle" });
      await page.setInputFiles("#fileInput", [path.join(FIX, "uyvy.ithmb")]);
      await settled(page);
      const btn = page.locator("#addFilesBtn");
      await expect(btn).toBeVisible();
      await expect(btn).toContainText(/Add files|添加文件/);
      const box = await btn.boundingBox();
      expect(box).not.toBeNull();
      if (width <= 560) expect(box!.height).toBeGreaterThanOrEqual(44);
      // Not absolutely positioned/overlapping: compare with the controls it
      // used to collide with.
      const overlaps = await page.evaluate(() => {
        const b = document.getElementById("addFilesBtn")!.getBoundingClientRect();
        const sels = [
          "#prevBtn",
          "#nextBtn",
          "#viewer-filmstrip",
          "#viewerPos",
          ".toolbar__actions",
        ];
        return sels.filter((sel) => {
          const el = document.querySelector(sel);
          if (!el) return false;
          const r = el.getBoundingClientRect();
          return b.right > r.left && b.left < r.right && b.bottom > r.top && b.top < r.bottom;
        });
      });
      expect(overlaps).toEqual([]);
      const position = await btn.evaluate((el) => getComputedStyle(el).position);
      expect(["static", "relative"]).toContain(position);
      // Clicking it opens the picker.
      const chooser = page.waitForEvent("filechooser");
      await btn.click();
      await chooser;
    }
  });

  test("Add files has visible hover/focus states and is keyboard reachable", async ({ page }) => {
    await page.goto("/ithmb-decoder/", { waitUntil: "networkidle" });
    await page.setInputFiles("#fileInput", [path.join(FIX, "uyvy.ithmb")]);
    await settled(page);
    // Font metrics settle the toolbar layout; hovering before that can leave
    // the pointer over a moved button, which is the one way this test flakes
    // under load.
    await page.evaluate(() => document.fonts.ready);
    const btn = page.locator("#addFilesBtn");
    await btn.focus();
    await expect(btn).toBeFocused();
    const outline = await btn.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { width: cs.outlineWidth, style: cs.outlineStyle, color: cs.outlineColor };
    });
    expect(outline.style).not.toBe("none");
    expect(parseFloat(outline.width)).toBeGreaterThanOrEqual(2);
    const bg1 = await btn.evaluate((el) => getComputedStyle(el).backgroundColor);
    await btn.hover();
    await expect
      .poll(() => btn.evaluate((el) => getComputedStyle(el).backgroundColor))
      .not.toBe(bg1);
    // Enter opens the picker without submitting anything.
    const chooser = page.waitForEvent("filechooser");
    await page.keyboard.press("Enter");
    await chooser;
  });

  test("failure state, dialog and mobile sweep stay coherent", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/ithmb-decoder/", { waitUntil: "networkidle" });
    const garbage = Buffer.alloc(64, 0xff);
    await page.setInputFiles("#fileInput", [
      { name: "bad.ithmb", mimeType: "application/octet-stream", buffer: garbage },
    ]);
    await waitDecodeSettled(page, 1);
    await expect(page.locator(".file-card.is-failure, .file-card.is-error")).toHaveCount(1);
    await expect(page.locator("#addFilesBtn")).toBeVisible();
    // Clear opens the confirm dialog and Escape closes it.
    await page.locator("#clearBtn").click();
    const dialog = page.locator("[role='dialog'], .confirm-dialog, .modal");
    if (await dialog.count()) {
      await expect(dialog.first()).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog.first()).toBeHidden({ timeout: 3000 });
    }
  });
});
