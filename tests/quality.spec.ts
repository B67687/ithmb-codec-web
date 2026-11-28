import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { waitDecodeSettled, waitViewerState } from "./helpers";

const FIXTURES = path.join(__dirname, "fixtures");

// ─── Mobile Responsive ─────────────────────────────────────────────────────

test.describe("Mobile responsive", () => {
  // Regression (needs history): horizontal overflow on iPhone-width home page.
  test("home page fits viewport at 375px (iPhone)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(380);
  });

  // Regression (needs history): decoder dropzone overflowed 375px viewports.
  test("decoder page layout at 375px (iPhone)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/ithmb-decoder/");
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(380);
    const dropzone = page.locator("#dropzone");
    const dzBox = await dropzone.boundingBox();
    expect(dzBox).not.toBeNull();
    expect(dzBox!.width).toBeLessThanOrEqual(370);
  });

  // Guards: no horizontal overflow at iPad width.
  test("home page layout at 768px (iPad)", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/");
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(773);
  });

  // Guards: no horizontal overflow on the guide page at 375px.
  test("guide page layout at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/guide/how-to-open-ithmb-files.html");
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(380);
  });
});

// ─── Keyboard Accessibility ─────────────────────────────────────────────────

test.describe("Keyboard navigation", () => {
  // Guards: keyboard tab order reaches interactive elements.
  test("Tab navigates through interactive elements on home page", async ({ page }) => {
    await page.goto("/");
    const elements = [];
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press("Tab");
      const tag = await page.evaluate(() => {
        const el = document.activeElement;
        return el ? `${el.tagName}#${el.id}` : "";
      });
      if (tag) elements.push(tag);
    }
    expect(elements.length).toBeGreaterThan(3);
  });

  // Guards: Escape leaves the persistent viewer open (no grid toggle anymore).
  test("Escape leaves the persistent viewer open", async ({ page }) => {
    await page.goto("/ithmb-decoder/");
    const [fc] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.locator("#dropzone").click(),
    ]);
    await fc.setFiles([path.join(FIXTURES, "test1.ithmb")]);
    await waitDecodeSettled(page, 1);
    await page.locator(".file-card").first().click();
    await waitViewerState(page, "image");
    const viewer = page.locator("#viewer-container");
    await expect(viewer).toBeVisible();
    await page.keyboard.press("Escape");
    // Escape is a no-op for the persistent viewer: give the handler a frame.
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
    await expect(viewer).toBeVisible();
  });

  // Guards: arrow-key round-trip in viewer. Overlaps gallery.spec.ts (consolidation candidate).
  test("arrow keys navigate between decoded images", async ({ page }) => {
    await page.goto("/ithmb-decoder/");
    const [fc] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.locator("#dropzone").click(),
    ]);
    await fc.setFiles([
      path.join(FIXTURES, "test1.ithmb"),
      path.join(FIXTURES, "test2.ithmb"),
      path.join(FIXTURES, "test3.ithmb"),
      path.join(FIXTURES, "test4.ithmb"),
    ]);
    await waitDecodeSettled(page, 4);
    await page.locator(".file-card").first().click();
    await page.locator("#viewer-stage").click();
    await waitViewerState(page, "image");
    const pos1 = await page.locator("#viewerPos").textContent();
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => page.locator("#viewerPos").textContent()).not.toBe(pos1);
    const pos2 = await page.locator("#viewerPos").textContent();
    expect(pos1).not.toBe(pos2);
    await page.keyboard.press("ArrowLeft");
    await expect.poll(() => page.locator("#viewerPos").textContent()).toBe(pos1);
    const pos3 = await page.locator("#viewerPos").textContent();
    expect(pos3).toBe(pos1);
  });
});

// ─── Error States ───────────────────────────────────────────────────────────

test.describe("Error states", () => {
  // Guards: invalid-file drop shows the skip toast.
  test("invalid file shows error toast", async ({ page }) => {
    await page.goto("/ithmb-decoder/");
    // Unique name: chromium+firefox run in parallel — a shared name races
    // (one worker's unlink deletes while the other is mid-test).
    const invalidFile = path.join(
      FIXTURES,
      "invalid-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ".bin",
    );
    fs.writeFileSync(invalidFile, Buffer.alloc(64, 0xff));
    const [fc] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.locator("#dropzone").click(),
    ]);
    await fc.setFiles([invalidFile]);
    // A rejected file produces no decode: the persistent skip summary is set
    // synchronously, so wait for that instead of a pipeline state.
    const notice = page.locator("#batchNotice");
    await expect(notice).toBeVisible({ timeout: 10000 });
    await expect(notice).toContainText(/not \.ithmb/i);
    fs.rmSync(invalidFile, { force: true });
  });

  test("dropzone shows hint text", async ({ page }) => {
    await page.goto("/ithmb-decoder/");
    const hint = page.locator("#dropzone .hint");
    await expect(hint).toContainText(/click|browse|drop/i);
  });

  // W3 no-hang: a wasm fetch failure lands on the honest retry UI,
  // never a permanent spinner (the init timeout caps even a stalled fetch).
  test("wasm load failure shows retry UI instead of hanging", async ({ page }) => {
    await page.route("**/ithmb_wasm_bg.wasm*", async (route) => {
      await route.abort("failed");
    });
    await page.goto("/ithmb-decoder/");
    await expect(page.locator("#loadFailed")).toBeVisible({
      timeout: 20000,
    });
    await expect(page.locator("#loadFailed button")).toBeVisible();
    await expect(page.locator("#dropzone")).toHaveCSS("pointer-events", "none");
  });
});
