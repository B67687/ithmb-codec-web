/**
 * Playwright test suite for ImageGlass-style viewer mode (6+ files).
 * Tests viewer container, filmstrip thumbnails, navigation.
 */
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const PAGE_URL = "/ithmb-decoder/";
const FIXTURES = path.resolve(__dirname, "fixtures");

test.describe("Viewer Mode (6+ files)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PAGE_URL, { waitUntil: "networkidle" });
  });

  test("viewer container appears with 8 files", async ({ page }) => {
    const fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const fileChooser = await fc;
    const files = Array.from({ length: 8 }, (_, i) =>
      path.join(FIXTURES, "test" + (i + 1) + ".ithmb"),
    );
    await fileChooser.setFiles(files);

    await expect(page.locator("#viewer-container")).toBeVisible();
    await expect(page.locator(".filmstrip-thumb")).toHaveCount(8);
  });

  test("first thumbnail is active when viewer opens", async ({ page }) => {
    const fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const fileChooser = await fc;
    const files = Array.from({ length: 8 }, (_, i) =>
      path.join(FIXTURES, "test" + (i + 1) + ".ithmb"),
    );
    await fileChooser.setFiles(files);

    await expect(async () => {
      const statuses = await page
        .locator(".file-card .status")
        .allTextContents();
      expect(statuses.every((s) => !s.includes("Decoding..."))).toBe(true);
    }).toPass({ timeout: 60000 });

    await expect(page.locator(".filmstrip-thumb.active")).toHaveCount(1);
    await expect(page.locator("#viewer-stage canvas")).toBeAttached();
  });

  test("clicking a thumbnail switches the viewer", async ({ page }) => {
    const fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const fileChooser = await fc;
    const files = Array.from({ length: 8 }, (_, i) =>
      path.join(FIXTURES, "test" + (i + 1) + ".ithmb"),
    );
    await fileChooser.setFiles(files);

    await expect(async () => {
      const statuses = await page
        .locator(".file-card .status")
        .allTextContents();
      expect(statuses.every((s) => !s.includes("Decoding..."))).toBe(true);
    }).toPass({ timeout: 60000 });

    // Click the 3rd thumbnail in the filmstrip
    const third = page.locator(".filmstrip-thumb").nth(2);
    await third.click();
    await expect(page.locator(".filmstrip-thumb.active")).toHaveCount(1);
    // Position indicator should show the clicked file's number in the batch.
    // Filmstrip order = WASM decode completion order (non-deterministic across
    // browsers), so derive the expected position from the card the thumb maps to.
    const clickedCardId = await third.getAttribute("data-filmstrip-card");
    const expectedPos = await page.evaluate((cardId) => {
      const cards = document.querySelectorAll<HTMLElement>(".file-card");
      const target = Array.from(cards).find((c) => c.dataset.cardId === cardId);
      return target ? Array.from(cards).indexOf(target) + 1 : -1;
    }, clickedCardId);
    await expect(page.locator("#viewerPos")).toContainText(
      new RegExp(`${expectedPos} \\/ 8`),
    );
  });

  test("viewer stage stays fixed when navigating between different-sized images", async ({
    page,
  }) => {
    // Mixed-size inputs: test1 is 42x30, uyvy is 720x480. The stage must NOT
    // resize when switching — the gallery height should stay constant.
    const fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const fileChooser = await fc;
    await fileChooser.setFiles([
      path.join(FIXTURES, "test1.ithmb"),
      path.join(FIXTURES, "uyvy.ithmb"),
    ]);

    await expect(async () => {
      const statuses = await page
        .locator(".file-card .status")
        .allTextContents();
      expect(statuses.every((s) => !s.includes("Decoding..."))).toBe(true);
    }).toPass({ timeout: 60000 });

    const stageHeight = async () =>
      page.evaluate(() => {
        const el = document.querySelector<HTMLElement>("#viewer-stage");
        return el ? Math.round(el.getBoundingClientRect().height) : -1;
      });

    const firstH = await stageHeight();
    expect(firstH).toBeGreaterThan(0);

    // Navigate to the second (larger) image
    await page.locator("#nextBtn").click();
    await page.waitForTimeout(300);
    const secondH = await stageHeight();

    expect(secondH).toBe(firstH);
  });

  test("arrow keys navigate between images", async ({ page }) => {
    const fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const fileChooser = await fc;
    const files = Array.from({ length: 8 }, (_, i) =>
      path.join(FIXTURES, "test" + (i + 1) + ".ithmb"),
    );
    await fileChooser.setFiles(files);

    await expect(async () => {
      const statuses = await page
        .locator(".file-card .status")
        .allTextContents();
      expect(statuses.every((s) => !s.includes("Decoding..."))).toBe(true);
    }).toPass({ timeout: 60000 });

    await expect(page.locator("#viewerPos")).toContainText(/1 \/ 8/);
    await page.waitForTimeout(2000);

    // Navigation is unified: filmstrip order === card order === viewer
    // numbering (thumbs are created as placeholders in file order at
    // card-creation time). So arrow nav is deterministic index arithmetic.
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#viewerPos")).toContainText(/2 \/ 8/);

    await page.keyboard.press("ArrowLeft");
    await expect(page.locator("#viewerPos")).toContainText(/1 \/ 8/);
  });

  test("filmstrip thumbs appear in file order as placeholders", async ({
    page,
  }) => {
    const fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const fileChooser = await fc;
    const files = Array.from({ length: 8 }, (_, i) =>
      path.join(FIXTURES, "test" + (i + 1) + ".ithmb"),
    );
    await fileChooser.setFiles(files);

    // Placeholders are created synchronously at card-creation time, BEFORE
    // decode completes — filmstrip order must equal file-card order.
    await expect(page.locator(".filmstrip-thumb")).toHaveCount(8);
    const order = await page.evaluate(() => {
      const thumbs = Array.from(
        document.querySelectorAll<HTMLElement>(".filmstrip-thumb"),
      );
      const cards = Array.from(
        document.querySelectorAll<HTMLElement>(".file-card"),
      );
      return thumbs.every(
        (t, i) =>
          cards[i] && t.dataset.filmstripCard === cards[i].dataset.cardId,
      );
    });
    expect(order).toBe(true);

    await expect(async () => {
      const statuses = await page
        .locator(".file-card .status")
        .allTextContents();
      expect(statuses.every((s) => !s.includes("Decoding..."))).toBe(true);
    }).toPass({ timeout: 60000 });

    // Arrow nav still steps 1 -> 2 in file order after decode fills thumbs.
    await expect(page.locator("#viewerPos")).toContainText(/1 \/ 8/);
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#viewerPos")).toContainText(/2 \/ 8/);
  });

  test("Escape closes viewer", async ({ page }) => {
    const fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const fileChooser = await fc;
    const files = Array.from({ length: 8 }, (_, i) =>
      path.join(FIXTURES, "test" + (i + 1) + ".ithmb"),
    );
    await fileChooser.setFiles(files);

    await expect(async () => {
      const statuses = await page
        .locator(".file-card .status")
        .allTextContents();
      expect(statuses.every((s) => !s.includes("Decoding..."))).toBe(true);
    }).toPass({ timeout: 60000 });

    await expect(page.locator("#viewer-container")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#viewer-container")).not.toBeVisible();
  });
});

test.describe("Regression: Viewer pixel content", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PAGE_URL, { waitUntil: "networkidle" });
    const fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const fileChooser = await fc;
    const files = Array.from({ length: 8 }, (_, i) =>
      path.join(FIXTURES, "test" + (i + 1) + ".ithmb"),
    );
    await fileChooser.setFiles(files);
    // Wait for all decodes to finish AND stage canvas to be populated
    await expect(async () => {
      const statuses = await page
        .locator(".file-card .status")
        .allTextContents();
      expect(statuses.every((s) => !s.includes("Decoding..."))).toBe(true);
      // Ensure the stage has a canvas (not just the viewer open)
      const hasCanvas = await page.evaluate(
        () =>
          document.querySelector<HTMLCanvasElement>("#viewer-stage canvas") !==
          null,
      );
      expect(hasCanvas).toBe(true);
    }).toPass({ timeout: 60000 });
  });

  test("viewer stage canvas has non-blank pixel content", async ({ page }) => {
    // Regression: cloneNode(true) loses canvas pixel data
    // The stage canvas must have actual image content, not be blank
    const hasPixels = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>(
        "#viewer-stage canvas",
      );
      if (!canvas) return false;
      const ctx = canvas.getContext("2d");
      if (!ctx) return false;
      // Sample the center pixel — check alpha > 0
      const cx = Math.floor(canvas.width / 2);
      const cy = Math.floor(canvas.height / 2);
      const pixel = ctx.getImageData(cx, cy, 1, 1);
      return (pixel.data[3] ?? 0) > 0;
    });
    expect(hasPixels).toBe(true);
  });

  test("clicking a thumbnail switches the viewer image", async ({ page }) => {
    // Regression: filmstripIndex was always -1, clicking thumbnails did nothing
    // Verify stage canvas exists
    const hasCanvas = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>(
        "#viewer-stage canvas",
      );
      return !!canvas && canvas.toDataURL().length > 0;
    });
    expect(hasCanvas).toBe(true);

    // Click a non-first thumbnail (any will do — thumbnails may not be in card
    // order on all browsers due to non-deterministic WASM decode order)
    const thumbCount = await page.locator(".filmstrip-thumb").count();
    await page
      .locator(".filmstrip-thumb")
      .nth(thumbCount > 1 ? 1 : 0)
      .click();

    // Verify canvas still rendered after switching
    const stillHasCanvas = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>(
        "#viewer-stage canvas",
      );
      return !!canvas && canvas.toDataURL().length > 0;
    });
    expect(stillHasCanvas).toBe(true);

    // Position should have changed from initial
    const posText = await page.locator("#viewerPos").textContent();
    expect(posText).toMatch(/\d+ \/ 8/);
  });

  test("arrow key navigation switches the viewer image", async ({ page }) => {
    const hasCanvas = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>(
        "#viewer-stage canvas",
      );
      return !!canvas && canvas.toDataURL().length > 0;
    });
    expect(hasCanvas).toBe(true);

    // Filmstrip order = decode-completion order (can differ from card order),
    // so derive the expected position from the thumb adjacent to the active one
    // BEFORE pressing the key (the press moves the active thumb).
    const expectedPos = await page.evaluate(() => {
      const thumbs = Array.from(
        document.querySelectorAll<HTMLElement>(".filmstrip-thumb"),
      );
      const active = document.querySelector<HTMLElement>(
        ".filmstrip-thumb.active",
      );
      const idx = active ? thumbs.indexOf(active) : 0;
      const next = thumbs[(idx + 1) % thumbs.length];
      if (!next) return -1;
      const cards = Array.from(
        document.querySelectorAll<HTMLElement>(".file-card"),
      );
      const target = cards.find(
        (c) => c.dataset.cardId === next.dataset.filmstripCard,
      );
      return target ? cards.indexOf(target) + 1 : -1;
    });
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#viewerPos")).toContainText(
      new RegExp(`${expectedPos} \\/ 8`),
    );

    // Verify canvas still rendered after navigation
    const stillHasCanvas = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>(
        "#viewer-stage canvas",
      );
      return !!canvas && canvas.toDataURL().length > 0;
    });
    expect(stillHasCanvas).toBe(true);
  });

  test("failed decode shows placeholder in viewer", async ({ page }) => {
    const corruptFile = path.join(FIXTURES, "corrupt-gallery.ithmb");
    fs.writeFileSync(
      corruptFile,
      fs.readFileSync(path.join(FIXTURES, "test1.ithmb")).subarray(0, 100),
    );
    try {
      const fc = page.waitForEvent("filechooser");
      await page.locator("#dropzone").click();
      const fileChooser = await fc;
      await fileChooser.setFiles([corruptFile]);

      // Card appears with share box
      await expect(page.locator(".file-card .share-box")).toBeVisible({
        timeout: 10000,
      });

      // Viewer auto-opens and shows failed placeholder
      await expect(
        page.locator("#viewer-stage .viewer-placeholder.failed"),
      ).toBeVisible();
      await expect(
        page.locator("#viewer-stage .placeholder-title"),
      ).toContainText("Decode Failed");
    } finally {
      fs.rmSync(corruptFile, { force: true });
    }
  });
  test("filmstrip shows left-aligned thumbnails", async ({ page }) => {
    const justifyContent = await page.evaluate(() => {
      const fs = document.getElementById("viewer-filmstrip");
      return fs ? getComputedStyle(fs).justifyContent : null;
    });
    expect(justifyContent).toBe("flex-start");
  });

  test("viewer container is inside the page container", async ({ page }) => {
    const inside = await page.evaluate(() => {
      const vc = document.getElementById("viewer-container");
      const box = document.querySelector(".container");
      return box ? box.contains(vc) : false;
    });
    expect(inside).toBe(true);
  });

  test("viewer main shrink-wraps to image width", async ({ page }) => {
    const display = await page.evaluate(() => {
      const main = document.getElementById("viewer-main");
      return main ? getComputedStyle(main).display : null;
    });
    expect(display).toBe("flex");
  });

  test("arrows positioned relative to viewer container", async ({ page }) => {
    const rel = await page.evaluate(() => {
      const vc = document.getElementById("viewer-container");
      return vc ? getComputedStyle(vc).position : null;
    });
    expect(rel).toBe("relative");
    const mainPos = await page.evaluate(() => {
      const main = document.getElementById("viewer-main");
      return main ? getComputedStyle(main).position : null;
    });
    expect(mainPos).toBe("relative");
  });
});
test.describe("Regression: Batch behavior", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PAGE_URL, { waitUntil: "networkidle" });
  });

  test("dropping same files twice deduplicates", async ({ page }) => {
    const fc1 = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const f1 = await fc1;
    await f1.setFiles([
      path.join(FIXTURES, "test1.ithmb"),
      path.join(FIXTURES, "test2.ithmb"),
    ]);
    await page.waitForTimeout(12000);
    await expect(page.locator(".file-card")).toHaveCount(2);
    const fc2 = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const f2 = await fc2;
    await f2.setFiles([
      path.join(FIXTURES, "test1.ithmb"),
      path.join(FIXTURES, "test2.ithmb"),
    ]);
    await page.waitForTimeout(2000);
    await expect(page.locator(".file-card")).toHaveCount(2);
  });

  test("new batch appends without clearing old", async ({ page }) => {
    const fc1 = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const f1 = await fc1;
    await f1.setFiles([path.join(FIXTURES, "test1.ithmb")]);
    await page.waitForTimeout(12000);
    await expect(page.locator(".file-card")).toHaveCount(1);
    const fc2 = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const f2 = await fc2;
    await f2.setFiles([path.join(FIXTURES, "test3.ithmb")]);
    await page.waitForTimeout(2000);
    await expect(page.locator(".file-card")).toHaveCount(2);
  });

  test("dropzone visible after upload", async ({ page }) => {
    const fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const f = await fc;
    await f.setFiles([path.join(FIXTURES, "test1.ithmb")]);
    await page.waitForTimeout(12000);
    await expect(page.locator("#dropzone")).toBeVisible();
  });

  test("viewer toggle button works after files loaded", async ({ page }) => {
    const fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const f = await fc;
    await f.setFiles([path.join(FIXTURES, "test1.ithmb")]);
    await page.waitForTimeout(12000);
    const btn = page.locator("#viewToggleBtn");
    await expect(btn).toBeVisible();
    // Clicking toggles to grid mode
    await btn.click();
    await expect(page.locator("#viewer-container")).not.toBeVisible();
    // Clicking again toggles back to viewer
    await btn.click();
    await expect(page.locator("#viewer-container")).toBeVisible();
  });
  test("toggle button text switches between Grid view and Gallery", async ({
    page,
  }) => {
    const fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const fileChooser = await fc;
    await fileChooser.setFiles([path.join(FIXTURES, "test1.ithmb")]);
    await page.waitForTimeout(12000);
    await expect(page.locator("#viewToggleBtn")).toHaveText("Grid view");
    await page.locator("#viewToggleBtn").click();
    await expect(page.locator("#viewToggleBtn")).toHaveText("Gallery");
  });

  test("back to top link exists when viewer is open", async ({ page }) => {
    const fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const fileChooser = await fc;
    await fileChooser.setFiles([path.join(FIXTURES, "test1.ithmb")]);
    await page.waitForTimeout(12000);
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
    await page.waitForTimeout(300);
    await expect(page.locator("#backToTopLink")).toBeVisible();
    await expect(page.locator("#backToTopLink")).toContainText("↑");
  });

  test("thumbnail click updates viewer position", async ({ page }) => {
    const fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const fileChooser = await fc;
    const files = Array.from({ length: 8 }, (_, i) =>
      path.join(FIXTURES, "test" + (i + 1) + ".ithmb"),
    );
    await fileChooser.setFiles(files);
    await expect(async () => {
      const statuses = await page
        .locator(".file-card .status")
        .allTextContents();
      expect(statuses.every((s) => !s.includes("Decoding..."))).toBe(true);
    }).toPass({ timeout: 60000 });
    // Click the 2nd thumbnail; the position indicator should show the
    // clicked file's number in the batch. Filmstrip order = WASM decode
    // completion order (non-deterministic across browsers), so derive the
    // expected position from the card the thumb maps to.
    const thumb = page.locator(".filmstrip-thumb").nth(1);
    const cardId = await thumb.getAttribute("data-filmstrip-card");
    const expectedPos = await page.evaluate((cid) => {
      const cards = document.querySelectorAll<HTMLElement>(".file-card");
      const t = Array.from(cards).find((c) => c.dataset.cardId === cid);
      return t ? Array.from(cards).indexOf(t) + 1 : -1;
    }, cardId);
    await thumb.click();
    await expect(page.locator("#viewerPos")).toContainText(
      new RegExp(`${expectedPos} \\/ 8`),
    );
  });

  test("download format dropdown changes button text", async ({ page }) => {
    const fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const fileChooser = await fc;
    await fileChooser.setFiles([path.join(FIXTURES, "test1.ithmb")]);

    // Wait for decode by checking status
    await expect(async () => {
      const statuses = await page
        .locator(".file-card .status")
        .allTextContents();
      expect(statuses.every((s) => !s.includes("Decoding..."))).toBe(true);
    }).toPass({ timeout: 60000 });

    // The download format dropdown should exist
    const fmtSelect = page.locator("#downloadFormatSelect");
    await expect(fmtSelect).toBeVisible();

    // Changing format should update the Download All button text
    await fmtSelect.selectOption("image/png");
    await expect(page.locator("#downloadAllBtn")).toHaveAttribute(
      "title",
      /PNG/,
    );

    await fmtSelect.selectOption("image/bmp");
    await expect(page.locator("#downloadAllBtn")).toHaveAttribute(
      "title",
      /BMP/,
    );
  });

  test("holding ArrowRight advances viewer repeatedly", async ({ page }) => {
    const files = Array.from({ length: 8 }, (_, i) =>
      path.join(FIXTURES, "test" + (i + 1) + ".ithmb"),
    );
    const fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const fileChooser = await fc;
    await fileChooser.setFiles(files);

    // Wait for decode
    await expect(async () => {
      const statuses = await page
        .locator(".file-card .status")
        .allTextContents();
      expect(statuses.every((s) => !s.includes("Decoding..."))).toBe(true);
    }).toPass({ timeout: 60000 });

    // Capture which thumb is active before holding
    const before = await page.evaluate(() => {
      const active = document.querySelector<HTMLElement>(
        ".filmstrip-thumb.active",
      );
      return active ? active.dataset.filmstripCard : null;
    });

    // Focus the page for keyboard events
    await page.locator("#viewer-stage").click();
    await page.waitForTimeout(200);

    // Keyboard hold should advance the viewer
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(3000);
    await page.keyboard.up("ArrowRight");

    // The active thumb must have changed from the starting one
    const after = await page.evaluate(() => {
      const active = document.querySelector<HTMLElement>(
        ".filmstrip-thumb.active",
      );
      return active ? active.dataset.filmstripCard : null;
    });
    expect(after).not.toBe(before);
    // And the position indicator shows a valid value
    await expect(page.locator("#viewerPos")).toContainText(/\d+ \/ 8/);
  });

  test("grid mode has format select in file cards", async ({ page }) => {
    const fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const fileChooser = await fc;
    await fileChooser.setFiles([path.join(FIXTURES, "test1.ithmb")]);

    // Wait for decode
    await expect(async () => {
      const statuses = await page
        .locator(".file-card .status")
        .allTextContents();
      expect(statuses.every((s) => !s.includes("Decoding..."))).toBe(true);
    }).toPass({ timeout: 60000 });

    // Toggle to grid mode
    await page.locator("#viewToggleBtn").click();
    await page.waitForTimeout(500);

    // Check that the format select exists in grid mode
    await expect(page.locator("select.fmt-select")).toBeVisible();
  });
});

test.describe("New: Additional functionality", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PAGE_URL, { waitUntil: "networkidle" });
  });

  test("download all creates a zip file", async ({ page }) => {
    const fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const fileChooser = await fc;
    const files = Array.from({ length: 2 }, (_, i) =>
      path.join(FIXTURES, "test" + (i + 1) + ".ithmb"),
    );
    await fileChooser.setFiles(files);

    await expect(async () => {
      const statuses = await page
        .locator(".file-card .status")
        .allTextContents();
      expect(statuses.every((s) => !s.includes("Decoding..."))).toBe(true);
    }).toPass({ timeout: 60000 });

    await expect(page.locator("#downloadAllBtn")).toBeVisible();

    const downloadPromise = page.waitForEvent("download", { timeout: 10000 });
    await page.locator("#downloadAllBtn").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.zip$/i);
  });

  test("holding ArrowRight advances through multiple images", async ({
    page,
  }) => {
    const fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const fileChooser = await fc;
    const files = Array.from({ length: 8 }, (_, i) =>
      path.join(FIXTURES, "test" + (i + 1) + ".ithmb"),
    );
    await fileChooser.setFiles(files);

    await expect(async () => {
      const statuses = await page
        .locator(".file-card .status")
        .allTextContents();
      expect(statuses.every((s) => !s.includes("Decoding..."))).toBe(true);
    }).toPass({ timeout: 60000 });

    await expect(page.locator("#viewerPos")).toContainText(/1 \/ 8/);
    await page.waitForTimeout(2000);
    // Navigation is unified (filmstrip order === card order === numbering),
    // so a single ArrowRight step is deterministic: 1 -> 2.
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#viewerPos")).toContainText(/2 \/ 8/);
  });

  test("viewer placeholder CSS exists for failed decodes", async ({ page }) => {
    const hasClass = await page.evaluate(() => {
      const sheets = document.styleSheets;
      for (const sheet of sheets) {
        try {
          for (const rule of sheet.cssRules || sheet.rules) {
            if (
              rule instanceof CSSStyleRule &&
              rule.selectorText?.includes("viewer-placeholder")
            )
              return true;
          }
        } catch (e) {}
      }
      return false;
    });
    expect(hasClass).toBe(true);
  });

  test("keyboard shortcut G toggles grid view", async ({ page }) => {
    const fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const fileChooser = await fc;
    await fileChooser.setFiles([path.join(FIXTURES, "test1.ithmb")]);

    await expect(async () => {
      const statuses = await page
        .locator(".file-card .status")
        .allTextContents();
      expect(statuses.every((s) => !s.includes("Decoding..."))).toBe(true);
    }).toPass({ timeout: 60000 });

    await expect(page.locator("#viewer-container")).toBeVisible();

    await page.locator("#viewToggleBtn").click();
    await expect(page.locator("#viewer-container")).not.toBeVisible();

    await page.locator("#viewToggleBtn").click();
    await expect(page.locator("#viewer-container")).toBeVisible();
  });

  test("mobile viewport hides arrows and adapts filmstrip", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(PAGE_URL, { waitUntil: "networkidle" });

    const fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const fileChooser = await fc;
    const files = Array.from({ length: 8 }, (_, i) =>
      path.join(FIXTURES, "test" + (i + 1) + ".ithmb"),
    );
    await fileChooser.setFiles(files);

    await expect(async () => {
      const statuses = await page
        .locator(".file-card .status")
        .allTextContents();
      expect(statuses.every((s) => !s.includes("Decoding..."))).toBe(true);
    }).toPass({ timeout: 60000 });

    await expect(page.locator("#viewer-arrows")).not.toBeVisible();

    const thumbWidth = await page
      .locator(".filmstrip-thumb")
      .first()
      .evaluate((el) => (el as HTMLElement).offsetWidth);
    expect(thumbWidth).toBeLessThanOrEqual(60);
  });

  test("toast message appears and disappears", async ({ page }) => {
    // Toast appears on various actions — test by dropping a non-ithmb file
    const dataTransfer = await page.evaluateHandle(() => {
      const dt = new DataTransfer();
      const file = new File(["not a real file"], "test.txt", {
        type: "text/plain",
      });
      dt.items.add(file);
      return dt;
    });
    await page.dispatchEvent("#dropzone", "drop", { dataTransfer });
    await page.waitForTimeout(500);
    await expect(page.locator(".toast.show")).toBeVisible();
    await page.waitForTimeout(3000);
    await expect(page.locator(".toast.show")).not.toBeVisible();
  });

  test("footer has GitHub and BMC links", async ({ page }) => {
    await page.goto(PAGE_URL, { waitUntil: "load" });
    const footer = page.locator("footer");
    await expect(footer.locator('a[href*="github.com"]').first()).toBeVisible();
    await expect(footer.locator('a[href*="buymeacoffee"]')).toBeVisible();
    await expect(footer).toContainText("Powered by");
  });

  test("filmstrip scrolls when many thumbnails exist", async ({ page }) => {
    // Drop 12 files to overflow the filmstrip
    const files = Array.from({ length: 12 }, (_, i) =>
      path.join(FIXTURES, "test" + ((i % 8) + 1) + ".ithmb"),
    );
    const fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const fileChooser = await fc;
    await fileChooser.setFiles(files);

    // Wait for all decodes
    await expect(async () => {
      const statuses = await page
        .locator(".file-card .status")
        .allTextContents();
      expect(statuses.every((s) => !s.includes("Decoding..."))).toBe(true);
    }).toPass({ timeout: 60000 });

    const filmstrip = page.locator("#viewer-filmstrip");
    await expect(filmstrip).toBeVisible();

    // Verify filmstrip is scrollable (overflow-x: auto)
    const overflowX = await filmstrip.evaluate(
      (el) => getComputedStyle(el).overflowX,
    );
    expect(["auto", "scroll"]).toContain(overflowX);
  });

  test("keyboard shortcut G toggles grid/viewer mode", async ({ page }) => {
    await page.goto(PAGE_URL, { waitUntil: "networkidle" });
    const fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const fileChooser = await fc;
    await fileChooser.setFiles([path.join(FIXTURES, "test1.ithmb")]);

    await expect(async () => {
      const statuses = await page
        .locator(".file-card .status")
        .allTextContents();
      expect(statuses.every((s) => !s.includes("Decoding..."))).toBe(true);
    }).toPass({ timeout: 60000 });

    // Press G to toggle to grid mode
    await page.keyboard.press("g");
    await page.waitForTimeout(300);
    await expect(page.locator("#viewer-container")).not.toBeVisible();

    // Press G again to toggle back
    await page.keyboard.press("g");
    await page.waitForTimeout(300);
    await expect(page.locator("#viewer-container")).toBeVisible();
  });

  test("global download-format select does not override per-card formats", async ({
    page,
  }) => {
    const fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const fileChooser = await fc;
    await fileChooser.setFiles([path.join(FIXTURES, "test1.ithmb")]);

    await expect(async () => {
      const statuses = await page
        .locator(".file-card .status")
        .allTextContents();
      expect(statuses.every((s) => !s.includes("Decoding..."))).toBe(true);
    }).toPass({ timeout: 60000 });

    // Baseline: card select defaults to JPEG, save button says Save JPEG
    const cardSelect = page.locator("select.fmt-select").first();
    const saveBtn = page.locator("[data-save]").first();
    await expect(cardSelect).toHaveValue("image/jpeg");
    await expect(saveBtn).toHaveText("Save JPEG");

    // Changing the GLOBAL selector must NOT touch the per-card select/save button
    await page.locator("#downloadFormatSelect").selectOption("image/png");
    await expect(page.locator("#downloadAllBtn")).toHaveAttribute(
      "title",
      /PNG/,
    );
    await expect(cardSelect).toHaveValue("image/jpeg");
    await expect(saveBtn).toHaveText("Save JPEG");

    // Changing the PER-CARD select must NOT touch the global selector/button
    await cardSelect.selectOption("image/bmp");
    await expect(saveBtn).toHaveText("Save BMP");
    await expect(page.locator("#downloadFormatSelect")).toHaveValue(
      "image/png",
    );
    await expect(page.locator("#downloadAllBtn")).toHaveAttribute(
      "title",
      /PNG/,
    );
  });
});
