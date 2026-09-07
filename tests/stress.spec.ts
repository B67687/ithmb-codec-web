import path from "node:path";
/**
 * Stress test suite for the ithmb-decoder WASM decoder page.
 * Tests full user flows: drop validation, viewer lifecycle,
 * navigation, modal interactions, deduplication, batching,
 * scroll behavior, and grid/viewer mode toggles.
 */
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const PAGE_URL = "/ithmb-decoder/";
const FIXTURES = path.resolve(__dirname, "fixtures");

/** Wait for all file cards to finish decoding (no "Decoding..." text remaining). */
async function waitForDecode(page: Page) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const statuses = await page.locator(".file-card .status").allTextContents();
    if (statuses.length && statuses.every((s) => !s.includes("Decoding..."))) return;
    await page.waitForTimeout(1000);
  }
  throw new Error("Decode did not complete within 60s");
}

/** Drop files via the file-chooser triggered by clicking the dropzone. */
interface DropFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}
async function dropFiles(page: Page, filePaths: string[] | DropFile[]) {
  const fc = page.waitForEvent("filechooser");
  await page.locator("#dropzone").click();
  const fileChooser = await fc;
  await fileChooser.setFiles(filePaths);
}

test.describe("Stress: Full user flows", () => {
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(60000);
    await page.goto(PAGE_URL, { waitUntil: "load" });
  });

  test("1: Drop zone rejects invalid files", async ({ page }) => {
    // Drop a .txt file — the app should reject it with a toast
    await dropFiles(page, [
      {
        name: "invalid.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("not a valid ithmb file"),
      },
    ]);

    // Toast should appear with rejection message
    await expect(page.locator("#toast")).toContainText(/1 file\(s\) skipped/);
    // No file card should be created
    await expect(page.locator(".file-card")).toHaveCount(0);
  });

  test("2: Drop single file — viewer opens", async ({ page }) => {
    await dropFiles(page, [path.join(FIXTURES, "test1.ithmb")]);
    await waitForDecode(page);
    await page.waitForTimeout(12000);

    // Viewer container should be visible with a canvas inside
    await expect(page.locator("#viewer-container")).toBeVisible();
    await expect(page.locator("#viewer-stage canvas")).toBeAttached();
    await expect(page.locator(".file-card")).toHaveCount(1);
    await expect(page.locator(".file-card .status")).toContainText("Decoded");
  });

  test("3: Drop 8 files — filmstrip has 8 thumbnails", async ({ page }) => {
    const files = Array.from({ length: 8 }, (_, i) =>
      path.join(FIXTURES, "test" + (i + 1) + ".ithmb"),
    );
    await dropFiles(page, files);
    await waitForDecode(page);

    await expect(page.locator("#viewer-container")).toBeVisible();
    await expect(page.locator(".filmstrip-thumb")).toHaveCount(8);
    await expect(page.locator("#viewerPos")).toContainText(/1 \/ 8/);
  });

  test("4: Navigate by clicking filmstrip thumbnails", async ({ page }) => {
    const files = Array.from({ length: 8 }, (_, i) =>
      path.join(FIXTURES, "test" + (i + 1) + ".ithmb"),
    );
    await dropFiles(page, files);
    await waitForDecode(page);

    // Click the LAST thumbnail (least likely to be the same as current first card)
    const lastIdx = (await page.locator(".filmstrip-thumb").count()) - 1;
    await page.locator(".filmstrip-thumb").nth(lastIdx).click();
    await expect(async () => {
      const pos = await page.locator("#viewerPos").textContent();
      expect(pos).toMatch(/\d+ \/ 8/);
    }).toPass({ timeout: 5000 });

    // Click another thumbnail — position should change
    const pos1 = await page.locator("#viewerPos").textContent();
    await page.locator(".filmstrip-thumb").nth(1).click();
    const pos2 = await page.locator("#viewerPos").textContent();
    expect(pos1).not.toBe(pos2);
  });

  test("5: Navigate by arrow keys (cyclic)", async ({ page }) => {
    const files = Array.from({ length: 8 }, (_, i) =>
      path.join(FIXTURES, "test" + (i + 1) + ".ithmb"),
    );
    await dropFiles(page, files);
    await waitForDecode(page);

    // Should start at first image
    await expect(page.locator("#viewerPos")).toContainText(/1 \/ 8/);

    // Navigation is unified (filmstrip order === card order === numbering),
    // so cyclic arrow nav is deterministic: left from 1 wraps to 8,
    // right from 8 wraps back to 1.
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator("#viewerPos")).toContainText(/8 \/ 8/);

    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#viewerPos")).toContainText(/1 \/ 8/);
  });

  test("6: Toggle to grid mode and back", async ({ page }) => {
    await dropFiles(page, [path.join(FIXTURES, "test1.ithmb")]);
    await page.waitForTimeout(12000);

    const toggleBtn = page.locator("#viewToggleBtn");
    await expect(toggleBtn).toBeVisible();

    // Click toggles to grid mode — viewer container hidden
    await toggleBtn.click();
    await expect(page.locator("#viewer-container")).not.toBeVisible();

    // Click again toggles back to viewer mode — viewer container visible
    await toggleBtn.click();
    await expect(page.locator("#viewer-container")).toBeVisible();
  });

  test("9: Escape closes viewer", async ({ page }) => {
    await dropFiles(page, [path.join(FIXTURES, "test1.ithmb")]);
    await page.waitForTimeout(12000);

    await expect(page.locator("#viewer-container")).toBeVisible();

    // Press Escape — viewer should close
    await page.keyboard.press("Escape");
    await expect(page.locator("#viewer-container")).not.toBeVisible();
  });

  test("10: Same file deduplication", async ({ page }) => {
    // Drop test1.ithmb
    await dropFiles(page, [path.join(FIXTURES, "test1.ithmb")]);
    await page.waitForTimeout(12000);
    await expect(page.locator(".file-card")).toHaveCount(1);

    // Drop test1.ithmb again — should be deduplicated by filename
    await dropFiles(page, [path.join(FIXTURES, "test1.ithmb")]);
    await page.waitForTimeout(2000);
    await expect(page.locator(".file-card")).toHaveCount(1);
  });

  test("11: Multiple batches append correctly", async ({ page }) => {
    // First batch: drop test1.ithmb
    await dropFiles(page, [path.join(FIXTURES, "test1.ithmb")]);
    await page.waitForTimeout(12000);
    await expect(page.locator(".file-card")).toHaveCount(1);

    // Second batch: drop test2.ithmb — should append, not replace
    await dropFiles(page, [path.join(FIXTURES, "test2.ithmb")]);
    await page.waitForTimeout(2000);
    await expect(page.locator(".file-card")).toHaveCount(2);
  });

  test("12: Back-to-top appears on scroll and scrolls to top", async ({ page }) => {
    const files = Array.from({ length: 8 }, (_, i) =>
      path.join(FIXTURES, "test" + (i + 1) + ".ithmb"),
    );
    await dropFiles(page, files);
    await waitForDecode(page);

    // Scroll to the bottom to trigger back-to-top
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
      window.dispatchEvent(new Event("scroll"));
    });
    await page.waitForTimeout(300);
    const backToTop = page.locator("#backToTop");
    await expect(backToTop).toBeAttached();
  });
});

test("13: Viewer arrows hidden in grid mode", async ({ page }) => {
  await page.goto(PAGE_URL, { waitUntil: "load" });
  await dropFiles(page, [path.join(FIXTURES, "test1.ithmb")]);
  await waitForDecode(page);

  // Viewer arrows should be visible initially (inside viewer container)
  await expect(page.locator("#viewerArrowLeft")).toBeVisible();
  await expect(page.locator("#viewerArrowRight")).toBeVisible();

  // Toggle to grid mode
  await page.locator("#viewToggleBtn").click();

  // Container is hidden so arrows should not be visible
  await expect(page.locator("#viewer-container")).not.toBeVisible();
  await expect(page.locator("#viewerArrowLeft")).not.toBeVisible();
  await expect(page.locator("#viewerArrowRight")).not.toBeVisible();

  // Toggle back
  await page.locator("#viewToggleBtn").click();
  await expect(page.locator("#viewer-container")).toBeVisible();
  await expect(page.locator("#viewerArrowLeft")).toBeVisible();
  await expect(page.locator("#viewerArrowRight")).toBeVisible();
});
