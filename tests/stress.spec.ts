import path from "node:path";
/**
 * Stress test suite for the ithmb-decoder WASM decoder page.
 * Tests full user flows: drop validation, viewer lifecycle,
 * navigation, modal interactions, deduplication, batching,
 * scroll behavior, and grid/viewer mode toggles.
 */
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { sampleVisibility, waitDecodeSettled, waitForBatchSkip } from "./helpers";

const PAGE_URL = "/ithmb-decoder/";
const FIXTURES = path.resolve(__dirname, "fixtures");

/* Wait for all file cards to finish decoding using the app's published
 * pipeline state (`body[data-decode-phase]`), not a text/status poll.
 * W3 no-hang: capped at 25s so the helper itself fails with a clear error
 * INSIDE the 30s Playwright test timeout. */
async function waitForDecode(page: Page, minFiles = 1) {
  await waitDecodeSettled(page, minFiles, 25_000);
}

/** Drop files via the persistent file input (the drop card hides once the
 *  loaded state is up, so later batches go through the same input). */
interface DropFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}
async function dropFiles(page: Page, filePaths: string[] | DropFile[]) {
  await page.setInputFiles("#fileInput", filePaths);
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

    // Persistent batch summary carries the rejection reason.
    await expect(page.locator("#batchNotice")).toBeVisible();
    await expect(page.locator("#batchNotice")).toContainText(/not \.ithmb/i);
    // No file card should be created
    await expect(page.locator(".file-card")).toHaveCount(0);
  });

  test("2: Drop single file — viewer opens", async ({ page }) => {
    await dropFiles(page, [path.join(FIXTURES, "test1.ithmb")]);
    await waitForDecode(page);

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

  test("6: viewer and results grid are always visible together", async ({ page }) => {
    await dropFiles(page, [path.join(FIXTURES, "test1.ithmb")]);
    await waitForDecode(page);

    // No grid toggle exists; the viewer stays above the results grid.
    await expect(page.locator(".results-head__meta .icon-btn")).toHaveCount(1);
    await expect(page.locator("#viewer-container")).toBeVisible();
    await expect(page.locator("#file-list .file-card")).toHaveCount(1);
    await expect(page.locator("#file-list")).toBeVisible();
  });

  test("9: Escape does not hide the persistent viewer", async ({ page }) => {
    await dropFiles(page, [path.join(FIXTURES, "test1.ithmb")]);
    await waitForDecode(page);

    await expect(page.locator("#viewer-container")).toBeVisible();

    // Escape no longer closes the viewer: it stays visible above the grid.
    await page.keyboard.press("Escape");
    // Sample across the frame window a hide transition would use, instead of
    // sleeping 200 ms and checking once at the end.
    const stayedVisible = await sampleVisibility(page, "#viewer-container", 250);
    expect(stayedVisible.every(Boolean)).toBe(true);
  });

  test("10: Same file deduplication", async ({ page }) => {
    // Drop test1.ithmb
    await dropFiles(page, [path.join(FIXTURES, "test1.ithmb")]);
    await waitForDecode(page);
    await expect(page.locator(".file-card")).toHaveCount(1);

    // Drop test1.ithmb again — should be deduplicated by filename. Re-add via
    // the Add files control: it resets the input value first, so re-selecting
    // the identical file fires `change` (setInputFiles with an unchanged value
    // does not) and the dedupe path actually runs. The batch adds no cards, so
    // wait for the duplicate skip in the summary.
    const readd = page.waitForEvent("filechooser");
    await page.locator("#addFilesBtn").click();
    await (await readd).setFiles([path.join(FIXTURES, "test1.ithmb")]);
    await waitForBatchSkip(page, "duplicates", 1);
    await expect(page.locator(".file-card")).toHaveCount(1);
  });

  test("11: Multiple batches append correctly", async ({ page }) => {
    // First batch: drop test1.ithmb
    await dropFiles(page, [path.join(FIXTURES, "test1.ithmb")]);
    await waitForDecode(page);
    await expect(page.locator(".file-card")).toHaveCount(1);

    // Second batch: drop test2.ithmb — should append, not replace
    await dropFiles(page, [path.join(FIXTURES, "test2.ithmb")]);
    await waitForDecode(page, 2);
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
    const backToTop = page.locator("#backToTop");
    await expect(backToTop).toBeAttached();
  });
});

test("13: Viewer arrows stay visible with the results grid", async ({ page }) => {
  await page.goto(PAGE_URL, { waitUntil: "load" });
  await dropFiles(page, [path.join(FIXTURES, "test1.ithmb")]);
  await waitForDecode(page);

  await expect(page.locator("#viewer-container")).toBeVisible();
  await expect(page.locator("#prevBtn")).toBeVisible();
  await expect(page.locator("#nextBtn")).toBeVisible();
  await expect(page.locator("#file-list .file-card")).toHaveCount(1);
});
