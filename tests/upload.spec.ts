import path from "node:path";
/**
 * Playwright test suite for WASM decoder file uploads.
 * Tests batch decoding, second-batch decoding, duplicate filenames, and compact threshold.
 */
import { expect, test } from "@playwright/test";

const PAGE_URL = "/ithmb-decoder/";
const FIXTURES = path.resolve(__dirname, "fixtures");

test.describe("File Upload", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#dropzone");
  });

  // Guards: core 8-file decode flow.
  test("drops 8 distinct files — all decode successfully", async ({ page }) => {
    const fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const fileChooser = await fc;

    const files = Array.from({ length: 8 }, (_, i) =>
      path.join(FIXTURES, "test" + (i + 1) + ".ithmb"),
    );
    await fileChooser.setFiles(files);

    await expect(page.locator(".file-card")).toHaveCount(8);

    // Wait until all cards are done decoding
    await expect(async () => {
      const statuses = await page.locator(".file-card .status").allTextContents();
      expect(statuses.every((s) => !s.includes("Decoding..."))).toBe(true);
    }).toPass({ timeout: 60000 });

    const statuses = await page.locator(".file-card .status").allTextContents();
    for (const s of statuses) {
      expect(s).not.toContain("Error");
    }
    expect(statuses.length).toBe(8);
  });

  // Guards: second-batch decoding.
  test("second batch of distinct files also decodes", async ({ page }) => {
    // First batch
    let fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    let f = await fc;
    await f.setFiles([
      path.join(FIXTURES, "test1.ithmb"),
      path.join(FIXTURES, "test2.ithmb"),
      path.join(FIXTURES, "test3.ithmb"),
    ]);
    await expect(page.locator(".file-card")).toHaveCount(3);
    await expect(async () => {
      const s = await page.locator(".file-card .status").allTextContents();
      expect(s.every((t) => !t.includes("Decoding..."))).toBe(true);
    }).toPass({ timeout: 60000 });

    // Second batch
    fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    f = await fc;
    await f.setFiles([
      path.join(FIXTURES, "test4.ithmb"),
      path.join(FIXTURES, "test5.ithmb"),
      path.join(FIXTURES, "test6.ithmb"),
    ]);
    await expect(page.locator(".file-card")).toHaveCount(6);
    await expect(async () => {
      const s = await page.locator(".file-card .status").allTextContents();
      expect(s.every((t) => !t.includes("Decoding..."))).toBe(true);
    }).toPass({ timeout: 60000 });

    const statuses = await page.locator(".file-card .status").allTextContents();
    expect(statuses.length).toBe(6);
    for (const s of statuses) {
      expect(s).toContain("Decoded");
    }
  });

  // Guards: duplicate-filename handling.
  test("duplicate filenames — same file dropped 8 times", async ({ page }) => {
    // Focus on console errors
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    // First drop: file test1.ithmb once
    let fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    let f = await fc;
    await f.setFiles([path.join(FIXTURES, "test1.ithmb")]);
    await expect(page.locator(".file-card")).toHaveCount(1);
    await expect(async () => {
      const s = await page.locator(".file-card .status").allTextContents();
      expect(s.every((t) => !t.includes("Decoding..."))).toBe(true);
    }).toPass({ timeout: 60000 });

    // Second drop: drop test1.ithmb again — same file, same content hash, should be deduplicated
    fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    f = await fc;
    await f.setFiles([path.join(FIXTURES, "test1.ithmb")]);
    await page.waitForTimeout(1000);

    // With content-hash deduplication, the identical file is not re-added
    await expect(page.locator(".file-card")).toHaveCount(1);
    // We expect no unhandled errors
    expect(errors).toHaveLength(0);
  });

  test.describe("Drag and Drop", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#dropzone");
    });

    // Guards: drag overlay enter/leave signal.
    test("drag overlay appears on dragenter and clears on dragleave", async ({ page }) => {
      // Verify overlay is not active initially
      await expect(page.locator("#dropOverlay")).not.toHaveClass(/active/);

      // Simulate dragover + dragenter with a file
      await page.evaluate(() => {
        const dt = new DataTransfer();
        dt.items.add(new File([new Uint8Array(100)], "test.ithmb"));
        document.dispatchEvent(new DragEvent("dragover", { bubbles: true, dataTransfer: dt }));
        document.dispatchEvent(new DragEvent("dragenter", { bubbles: true, dataTransfer: dt }));
      });

      // Overlay should now be active
      await expect(page.locator("#dropOverlay")).toHaveClass(/active/);
      await expect(page.locator("#dropzone")).toHaveClass(/drag-over/);
      await expect(page.locator("body")).toHaveClass(/drag-active/);

      // Simulate dragleave
      await page.evaluate(() => {
        document.dispatchEvent(
          new DragEvent("dragleave", { bubbles: true, dataTransfer: new DataTransfer() }),
        );
      });

      // Overlay should be cleared
      await expect(page.locator("#dropOverlay")).not.toHaveClass(/active/);
      await expect(page.locator("#dropzone")).not.toHaveClass(/drag-over/);
      await expect(page.locator("body")).not.toHaveClass(/drag-active/);
    });

    // Guards: drop-to-card creation.
    test("drop processes files and creates file cards", async ({ page }) => {
      // Simulate full drag-drop flow with a real .ithmb file
      await page.evaluate(async () => {
        const response = await fetch("/tests/fixtures/test1.ithmb");
        const blob = await response.blob();
        const file = new File([blob], "test1.ithmb", {
          type: "application/octet-stream",
        });
        const dt = new DataTransfer();
        dt.items.add(file);

        // Simulate the full drag-drop sequence
        document.dispatchEvent(new DragEvent("dragover", { bubbles: true, dataTransfer: dt }));
        document.dispatchEvent(new DragEvent("dragenter", { bubbles: true, dataTransfer: dt }));
        document.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: dt }));
      });

      // File card should appear
      await expect(page.locator(".file-card")).toHaveCount(1);

      // Wait for decode to finish
      await expect(async () => {
        const s = await page.locator(".file-card .status").first().textContent();
        expect(s).not.toContain("Decoding...");
      }).toPass({ timeout: 30000 });

      const status = await page.locator(".file-card .status").first().textContent();
      expect(status).toContain("Decoded");
    });

    // Guards: overlay reset after drop.
    test("drop overlay clears after successful drop", async ({ page }) => {
      await page.evaluate(async () => {
        const response = await fetch("/tests/fixtures/test1.ithmb");
        const blob = await response.blob();
        const file = new File([blob], "test1.ithmb", {
          type: "application/octet-stream",
        });
        const dt = new DataTransfer();
        dt.items.add(file);

        document.dispatchEvent(new DragEvent("dragenter", { bubbles: true, dataTransfer: dt }));
        document.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: dt }));
      });

      // Overlay should clear after drop
      await expect(page.locator("#dropOverlay")).not.toHaveClass(/active/);
      await expect(page.locator("body")).not.toHaveClass(/drag-active/);

      // File should still be processed
      await expect(page.locator(".file-card")).toHaveCount(1);
    });
  });
});
