import fs from "node:fs";
import path from "node:path";
/**
 * Playwright test suite for ImageGlass-style viewer mode (6+ files).
 * Tests viewer container, filmstrip thumbnails, navigation.
 */
import { expect, test } from "@playwright/test";
import {
  sampleVisibility,
  waitDecodeSettled,
  waitForBatchSkip,
  waitForDownload,
  waitForStableValue,
  waitViewerState,
} from "./helpers";

const PAGE_URL = "/ithmb-decoder/";
const FIXTURES = path.resolve(__dirname, "fixtures");

test.describe("Viewer Mode (6+ files)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#dropzone");
  });

  // Guards: viewer opens for 6+ file batches (core viewer contract).
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

  // Guards: exactly one active thumb + stage canvas on viewer open.
  test("first thumbnail is active when viewer opens", async ({ page }) => {
    const fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const fileChooser = await fc;
    const files = Array.from({ length: 8 }, (_, i) =>
      path.join(FIXTURES, "test" + (i + 1) + ".ithmb"),
    );
    await fileChooser.setFiles(files);

    await expect(async () => {
      const statuses = await page.locator(".file-card .status").allTextContents();
      expect(statuses.every((s) => !s.includes("Decoding..."))).toBe(true);
    }).toPass({ timeout: 60000 });

    await expect(page.locator(".filmstrip-thumb.active")).toHaveCount(1);
    await expect(page.locator("#viewer-stage canvas")).toBeAttached();
  });

  // Bug-link: needs history (position-indicator mapping across click nav).
  test("clicking a thumbnail switches the viewer", async ({ page }) => {
    const fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const fileChooser = await fc;
    const files = Array.from({ length: 8 }, (_, i) =>
      path.join(FIXTURES, "test" + (i + 1) + ".ithmb"),
    );
    await fileChooser.setFiles(files);

    await expect(async () => {
      const statuses = await page.locator(".file-card .status").allTextContents();
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
    await expect(page.locator("#viewerPos")).toContainText(new RegExp(`${expectedPos} \\/ 8`));
  });

  // Regression: stage height jumped when switching between different-sized images.
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
      const statuses = await page.locator(".file-card .status").allTextContents();
      expect(statuses.every((s) => !s.includes("Decoding..."))).toBe(true);
    }).toPass({ timeout: 60000 });

    const stageHeight = async () =>
      page.evaluate(() => {
        const el = document.querySelector<HTMLElement>("#viewer-stage");
        return el ? Math.round(el.getBoundingClientRect().height) : -1;
      });

    await expect(page.locator("#viewer-stage canvas")).toHaveCount(1);
    // Font/layout metrics settle over the first frames after the canvas lands;
    // poll for a stable stage height instead of sleeping a guessed 300 ms.
    await page.evaluate(() => document.fonts.ready);
    const firstH = await waitForStableValue(stageHeight);
    expect(firstH).toBeGreaterThan(0);

    // Navigate to the second (larger) image and wait until the viewer has
    // actually swapped before measuring (single 300ms samples flaked here
    // under parallel load).
    await page.locator("#nextBtn").click();
    await expect(page.locator("#viewerPos")).toContainText(/2 \/ 2/);
    await expect.poll(stageHeight, { timeout: 5000 }).toBe(firstH);
  });

  // Guards: arrow-key viewer navigation (unified index arithmetic).
  test("arrow keys navigate between images", async ({ page }) => {
    const fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const fileChooser = await fc;
    const files = Array.from({ length: 8 }, (_, i) =>
      path.join(FIXTURES, "test" + (i + 1) + ".ithmb"),
    );
    await fileChooser.setFiles(files);

    await expect(async () => {
      const statuses = await page.locator(".file-card .status").allTextContents();
      expect(statuses.every((s) => !s.includes("Decoding..."))).toBe(true);
    }).toPass({ timeout: 60000 });

    await expect(page.locator("#viewerPos")).toContainText(/1 \/ 8/);
    await waitViewerState(page, "image");

    // Navigation is unified: filmstrip order === card order === viewer
    // numbering (thumbs are created as placeholders in file order at
    // card-creation time). So arrow nav is deterministic index arithmetic.
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#viewerPos")).toContainText(/2 \/ 8/);

    await page.keyboard.press("ArrowLeft");
    await expect(page.locator("#viewerPos")).toContainText(/1 \/ 8/);
  });

  // Regression: thumbs arrived in decode-completion order, breaking nav numbering.
  test("filmstrip thumbs appear in file order as placeholders", async ({ page }) => {
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
      const thumbs = Array.from(document.querySelectorAll<HTMLElement>(".filmstrip-thumb"));
      const cards = Array.from(document.querySelectorAll<HTMLElement>(".file-card"));
      return thumbs.every(
        (t, i) => cards[i] && t.dataset.filmstripCard === cards[i].dataset.cardId,
      );
    });
    expect(order).toBe(true);

    await expect(async () => {
      const statuses = await page.locator(".file-card .status").allTextContents();
      expect(statuses.every((s) => !s.includes("Decoding..."))).toBe(true);
    }).toPass({ timeout: 60000 });

    // Arrow nav still steps 1 -> 2 in file order after decode fills thumbs.
    await expect(page.locator("#viewerPos")).toContainText(/1 \/ 8/);
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#viewerPos")).toContainText(/2 \/ 8/);
  });

  // Guards: Escape leaves the persistent viewer open (no grid toggle anymore).
  test("Escape leaves the persistent viewer open", async ({ page }) => {
    const fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const fileChooser = await fc;
    const files = Array.from({ length: 8 }, (_, i) =>
      path.join(FIXTURES, "test" + (i + 1) + ".ithmb"),
    );
    await fileChooser.setFiles(files);

    await expect(async () => {
      const statuses = await page.locator(".file-card .status").allTextContents();
      expect(statuses.every((s) => !s.includes("Decoding..."))).toBe(true);
    }).toPass({ timeout: 60000 });

    await expect(page.locator("#viewer-container")).toBeVisible();
    await page.keyboard.press("Escape");
    // Sample across the frame window a hide transition would use, instead of
    // sleeping and checking once at the end.
    const stayedVisible = await sampleVisibility(page, "#viewer-container", 250);
    expect(stayedVisible.every(Boolean)).toBe(true);
  });
});

test.describe("Regression: Viewer pixel content", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#dropzone");
    const fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const fileChooser = await fc;
    const files = Array.from({ length: 8 }, (_, i) =>
      path.join(FIXTURES, "test" + (i + 1) + ".ithmb"),
    );
    await fileChooser.setFiles(files);
    // Wait for all decodes to finish AND stage canvas to be populated
    await expect(async () => {
      const statuses = await page.locator(".file-card .status").allTextContents();
      expect(statuses.every((s) => !s.includes("Decoding..."))).toBe(true);
      // Ensure the stage has a canvas (not just the viewer open)
      const hasCanvas = await page.evaluate(
        () => document.querySelector<HTMLCanvasElement>("#viewer-stage canvas") !== null,
      );
      expect(hasCanvas).toBe(true);
    }).toPass({ timeout: 60000 });
  });

  test("viewer stage canvas has non-blank pixel content", async ({ page }) => {
    // Regression: cloneNode(true) loses canvas pixel data
    // The stage canvas must have actual image content, not be blank
    const hasPixels = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>("#viewer-stage canvas");
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
      const canvas = document.querySelector<HTMLCanvasElement>("#viewer-stage canvas");
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
      const canvas = document.querySelector<HTMLCanvasElement>("#viewer-stage canvas");
      return !!canvas && canvas.toDataURL().length > 0;
    });
    expect(stillHasCanvas).toBe(true);

    // Position should have changed from initial
    const posText = await page.locator("#viewerPos").textContent();
    expect(posText).toMatch(/\d+ \/ 8/);
  });

  // Guards: canvas survives arrow navigation (companion to the click-switch test above).
  test("arrow key navigation switches the viewer image", async ({ page }) => {
    const hasCanvas = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>("#viewer-stage canvas");
      return !!canvas && canvas.toDataURL().length > 0;
    });
    expect(hasCanvas).toBe(true);

    // Filmstrip order = decode-completion order (can differ from card order),
    // so derive the expected position from the thumb adjacent to the active one
    // BEFORE pressing the key (the press moves the active thumb).
    const expectedPos = await page.evaluate(() => {
      const thumbs = Array.from(document.querySelectorAll<HTMLElement>(".filmstrip-thumb"));
      const active = document.querySelector<HTMLElement>(".filmstrip-thumb.active");
      const idx = active ? thumbs.indexOf(active) : 0;
      const next = thumbs[(idx + 1) % thumbs.length];
      if (!next) return -1;
      const cards = Array.from(document.querySelectorAll<HTMLElement>(".file-card"));
      const target = cards.find((c) => c.dataset.cardId === next.dataset.filmstripCard);
      return target ? cards.indexOf(target) + 1 : -1;
    });
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#viewerPos")).toContainText(new RegExp(`${expectedPos} \\/ 8`));

    // Verify canvas still rendered after navigation
    const stillHasCanvas = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>("#viewer-stage canvas");
      return !!canvas && canvas.toDataURL().length > 0;
    });
    expect(stillHasCanvas).toBe(true);
  });

  // Guards: corrupt-file viewer placeholder (companion to decode-failure.spec.ts).
  test("failed decode shows placeholder in viewer", async ({ page }) => {
    const corruptFile = path.join(FIXTURES, "corrupt-gallery.ithmb");
    fs.writeFileSync(
      corruptFile,
      fs.readFileSync(path.join(FIXTURES, "test1.ithmb")).subarray(0, 100),
    );
    try {
      // The drop card is hidden after the beforeEach batch loaded; add the
      // corrupt file through the persistent input.
      await page.setInputFiles("#fileInput", [corruptFile]);

      // Card appears with the failure info block
      await expect(page.locator(".file-card .failure-info")).toBeVisible({
        timeout: 10000,
      });

      // Viewer auto-opens and shows the failed-decode info card
      await expect(page.locator("#viewer-stage .viewer-placeholder.failed")).toBeVisible();
      await expect(page.locator("#viewer-stage .failure-info__title")).toContainText(/decode/i);
    } finally {
      fs.rmSync(corruptFile, { force: true });
    }
  });
  // Regression (needs history): filmstrip alignment drifted from flex-start (centering-regression era).
  test("filmstrip shows left-aligned thumbnails", async ({ page }) => {
    const justifyContent = await page.evaluate(() => {
      const fs = document.getElementById("viewer-filmstrip");
      return fs ? getComputedStyle(fs).justifyContent : null;
    });
    expect(justifyContent).toBe("flex-start");
  });

  // Regression (needs history): the viewer band became full-bleed in the
  // design-lab port — it is deliberately OUTSIDE the 980px page container so
  // the black band spans the viewport (reference layout contract).
  test("viewer band is full-bleed outside the page container", async ({ page }) => {
    const { inside, width } = await page.evaluate(() => {
      const vc = document.getElementById("viewer-container");
      const box = document.querySelector(".container");
      const band = document.querySelector(".big-stage");
      return {
        inside: box && vc ? box.contains(vc) : false,
        width: band ? band.getBoundingClientRect().width : -1,
      };
    });
    expect(inside).toBe(false);
    expect(width).toBeGreaterThan(1000);
  });

  // Regression (needs history): viewer-main lost its flex shrink-wrap (stage sizing).
  test("viewer main shrink-wraps to image width", async ({ page }) => {
    const display = await page.evaluate(() => {
      const main = document.getElementById("viewer-main");
      return main ? getComputedStyle(main).display : null;
    });
    expect(display).toBe("flex");
  });

  // Regression (needs history): arrows positioned against the wrong ancestor.
  // In the ported layout the arrows are positioned inside .big-stage__view.
  test("arrows positioned relative to the stage view", async ({ page }) => {
    const mainPos = await page.evaluate(() => {
      const main = document.getElementById("viewer-main");
      return main ? getComputedStyle(main).position : null;
    });
    expect(mainPos).toBe("relative");
    const inside = await page.evaluate(() => {
      const main = document.getElementById("viewer-main");
      return !!main && main.contains(document.getElementById("prevBtn"));
    });
    expect(inside).toBe(true);
  });
});
test.describe("Regression: Batch behavior", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#dropzone");
  });

  // Regression: re-dropping files duplicated cards instead of deduplicating.
  test("dropping same files twice deduplicates", async ({ page }) => {
    const fc1 = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const f1 = await fc1;
    await f1.setFiles([path.join(FIXTURES, "test1.ithmb"), path.join(FIXTURES, "test2.ithmb")]);
    await waitDecodeSettled(page, 2);
    await expect(page.locator(".file-card")).toHaveCount(2);
    // The drop card is gone in the loaded state (reference layout); later
    // batches go through the Add files control. It resets the input value
    // first, so re-selecting the identical files still fires `change` (a
    // programmatic setInputFiles with an unchanged value does not) and the
    // duplicate path is genuinely exercised.
    const readd = page.waitForEvent("filechooser");
    await page.locator("#addFilesBtn").click();
    await (await readd).setFiles([
      path.join(FIXTURES, "test1.ithmb"),
      path.join(FIXTURES, "test2.ithmb"),
    ]);
    // Both files are duplicates, so no card is added: wait for the batch
    // summary's duplicate count instead of sleeping for a settle.
    await waitForBatchSkip(page, "duplicates", 2);
    await expect(page.locator(".file-card")).toHaveCount(2);
  });

  // Regression: a new batch cleared old cards instead of appending.
  test("new batch appends without clearing old", async ({ page }) => {
    const fc1 = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const f1 = await fc1;
    await f1.setFiles([path.join(FIXTURES, "test1.ithmb")]);
    await waitDecodeSettled(page, 1);
    await expect(page.locator(".file-card")).toHaveCount(1);
    await page.setInputFiles("#fileInput", [path.join(FIXTURES, "test3.ithmb")]);
    await waitDecodeSettled(page, 2);
    await expect(page.locator(".file-card")).toHaveCount(2);
  });

  // Regression: dropzone disappeared after upload. In the ported reference
  // layout that is the intended behaviour — the hero (with the drop card)
  // gives way to the toolbar; the hidden file input is the add-files path.
  test("dropzone hides after upload, persistent file input remains", async ({ page }) => {
    const fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const f = await fc;
    await f.setFiles([path.join(FIXTURES, "test1.ithmb")]);
    await waitDecodeSettled(page, 1);
    await expect(page.locator("#dropzone")).not.toBeVisible();
    await expect(page.locator("#fileInput")).toBeAttached();
    await expect(page.locator("#toolbar")).toHaveClass(/visible/);
  });

  // Guards: back-to-top link presence and text in viewer mode.
  test("back to top link exists when viewer is open", async ({ page }) => {
    const fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const fileChooser = await fc;
    await fileChooser.setFiles([path.join(FIXTURES, "test1.ithmb")]);
    await waitDecodeSettled(page, 1);
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
    await expect(page.locator("#backToTopLink")).toBeVisible();
    await expect(page.locator("#backToTopLink")).toContainText("↑");
  });

  // Guards: position indicator follows thumb clicks (companion to group-1 click test).
  test("thumbnail click updates viewer position", async ({ page }) => {
    const fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const fileChooser = await fc;
    const files = Array.from({ length: 8 }, (_, i) =>
      path.join(FIXTURES, "test" + (i + 1) + ".ithmb"),
    );
    await fileChooser.setFiles(files);
    await expect(async () => {
      const statuses = await page.locator(".file-card .status").allTextContents();
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
    await expect(page.locator("#viewerPos")).toContainText(new RegExp(`${expectedPos} \\/ 8`));
  });

  // Guards: the segmented output-format control updates the Download-all button.
  test("segmented format control changes the download title", async ({ page }) => {
    const fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const fileChooser = await fc;
    await fileChooser.setFiles([path.join(FIXTURES, "test1.ithmb")]);

    // Wait for decode by checking status
    await expect(async () => {
      const statuses = await page.locator(".file-card .status").allTextContents();
      expect(statuses.every((s) => !s.includes("Decoding..."))).toBe(true);
    }).toPass({ timeout: 60000 });

    // The reference chrome uses the segmented control; the native select is
    // the hidden functional backing store (not part of the visible layout).
    const segmented = page.locator("#fmtSeg");
    await expect(segmented).toBeVisible();
    await expect(page.locator("#downloadFormatSelect")).toBeHidden();

    await segmented.locator('[data-format="image/png"]').click();
    await expect(page.locator("#downloadAllBtn")).toHaveAttribute("title", /PNG/);
    await expect(page.locator("#downloadFormatSelect")).toHaveValue("image/png");

    await segmented.locator('[data-format="image/bmp"]').click();
    await expect(page.locator("#downloadAllBtn")).toHaveAttribute("title", /BMP/);
  });

  // Guards: key-hold repeat navigation advances the viewer.
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
      const statuses = await page.locator(".file-card .status").allTextContents();
      expect(statuses.every((s) => !s.includes("Decoding..."))).toBe(true);
    }).toPass({ timeout: 60000 });

    // Capture which thumb is active before holding
    const activeThumb = () =>
      page.evaluate(
        () =>
          document.querySelector<HTMLElement>(".filmstrip-thumb.active")?.dataset.filmstripCard ??
          null,
      );
    const before = await activeThumb();

    // Focus the page for keyboard events
    await page.locator("#viewer-stage").click();

    // Hold the key until the viewer actually advances, then release. The step
    // is state, not elapsed time, so poll for it instead of sleeping 3 s.
    await page.keyboard.down("ArrowRight");
    try {
      await expect.poll(activeThumb, { timeout: 5000 }).not.toBe(before);
    } finally {
      await page.keyboard.up("ArrowRight");
    }

    // The active thumb must have changed from the starting one
    const after = await activeThumb();
    expect(after).not.toBe(before);
    // And the position indicator shows a valid value
    await expect(page.locator("#viewerPos")).toContainText(/\d+ \/ 8/);
  });

  // Guards: per-card format select is visible in grid mode.
  test("grid mode has format select in file cards", async ({ page }) => {
    const fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const fileChooser = await fc;
    await fileChooser.setFiles([path.join(FIXTURES, "test1.ithmb")]);

    // Wait for decode
    await expect(async () => {
      const statuses = await page.locator(".file-card .status").allTextContents();
      expect(statuses.every((s) => !s.includes("Decoding..."))).toBe(true);
    }).toPass({ timeout: 60000 });

    // The results grid is always visible below the viewer.
    await expect(page.locator("select.fmt-select")).toBeVisible();
  });
});

test.describe("New: Additional functionality", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#dropzone");
  });

  // Guards: Download All produces a zip file.
  test("download all creates a zip file", async ({ page }) => {
    const fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const fileChooser = await fc;
    const files = Array.from({ length: 2 }, (_, i) =>
      path.join(FIXTURES, "test" + (i + 1) + ".ithmb"),
    );
    await fileChooser.setFiles(files);

    await expect(async () => {
      const statuses = await page.locator(".file-card .status").allTextContents();
      expect(statuses.every((s) => !s.includes("Decoding..."))).toBe(true);
    }).toPass({ timeout: 60000 });

    await expect(page.locator("#downloadAllBtn")).toBeVisible();

    // The download event is the export's completion point: wait for it instead
    // of polling with a timeout guess.
    const download = await waitForDownload(page, () => page.locator("#downloadAllBtn").click());
    expect(download.suggestedFilename()).toMatch(/\.zip$/i);
    const zipPath = await download.path();
    expect(zipPath).toBeTruthy();
    expect(fs.statSync(zipPath as string).size).toBeGreaterThan(0);
  });

  // Guards: single-step determinism 1 -> 2 (companion to the group-3 hold test).
  test("holding ArrowRight advances through multiple images", async ({ page }) => {
    const fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const fileChooser = await fc;
    const files = Array.from({ length: 8 }, (_, i) =>
      path.join(FIXTURES, "test" + (i + 1) + ".ithmb"),
    );
    await fileChooser.setFiles(files);

    await expect(async () => {
      const statuses = await page.locator(".file-card .status").allTextContents();
      expect(statuses.every((s) => !s.includes("Decoding..."))).toBe(true);
    }).toPass({ timeout: 60000 });

    await expect(page.locator("#viewerPos")).toContainText(/1 \/ 8/);
    await waitViewerState(page, "image");
    // Navigation is unified (filmstrip order === card order === numbering),
    // so a single ArrowRight step is deterministic: 1 -> 2.
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#viewerPos")).toContainText(/2 \/ 8/);
  });

  // Guards: failed-decode placeholder CSS ships (companion to the failed-decode test).
  test("viewer placeholder CSS exists for failed decodes", async ({ page }) => {
    const hasClass = await page.evaluate(() => {
      const sheets = document.styleSheets;
      for (const sheet of sheets) {
        try {
          for (const rule of sheet.cssRules || sheet.rules) {
            if (rule instanceof CSSStyleRule && rule.selectorText?.includes("viewer-placeholder"))
              return true;
          }
        } catch (e) {}
      }
      return false;
    });
    expect(hasClass).toBe(true);
  });

  // Guards: mobile viewer (arrows hidden, small thumbs at 375px).
  test("mobile viewport hides arrows and adapts filmstrip", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#dropzone");

    const fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const fileChooser = await fc;
    const files = Array.from({ length: 8 }, (_, i) =>
      path.join(FIXTURES, "test" + (i + 1) + ".ithmb"),
    );
    await fileChooser.setFiles(files);

    await expect(async () => {
      const statuses = await page.locator(".file-card .status").allTextContents();
      expect(statuses.every((s) => !s.includes("Decoding..."))).toBe(true);
    }).toPass({ timeout: 60000 });

    await expect(page.locator("#viewer-arrows")).not.toBeVisible();

    const thumbWidth = await page
      .locator(".filmstrip-thumb")
      .first()
      .evaluate((el) => (el as HTMLElement).offsetWidth);
    // Decoder UI pass: phone thumbs grew from 52px to 68px (44px tall touch
    // target) while staying compact; the guard is a ceiling, not a size spec.
    expect(thumbWidth).toBeLessThanOrEqual(72);
  });

  // Guards: invalid drop gets a persistent, dismissible batch summary.
  test("invalid drop shows a dismissible batch summary", async ({ page }) => {
    const dataTransfer = await page.evaluateHandle(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(["not a real file"], "test.txt", { type: "text/plain" }));
      return dt;
    });
    await page.dispatchEvent("#dropzone", "drop", { dataTransfer });
    const notice = page.locator("#batchNotice");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(/not \.ithmb/i);
    await notice.locator("[data-dismiss-batch]").click();
    await expect(notice).toBeHidden();
  });

  // Guards: footer GitHub/BMC links + Powered-by text.
  test("footer has GitHub and BMC links", async ({ page }) => {
    await page.goto(PAGE_URL, { waitUntil: "load" });
    const footer = page.locator("footer");
    await expect(footer.locator('a[href*="github.com"]').first()).toBeVisible();
    await expect(footer.locator('a[href*="buymeacoffee"]')).toBeVisible();
    await expect(footer).toContainText("Product");
    await expect(footer).toContainText("Support");
  });

  // Guards: filmstrip overflow-x scrolls when the rail is full.
  test("filmstrip scrolls when many thumbnails exist", async ({ page }) => {
    // Narrow viewport + the 9 unique success fixtures so the rail genuinely
    // overflows (12 files with repeating names are de-duplicated by design).
    await page.setViewportSize({ width: 480, height: 800 });
    const files = [
      "uyvy.ithmb",
      ...Array.from({ length: 8 }, (_, i) => "test" + (i + 1) + ".ithmb"),
    ].map((f) => path.join(FIXTURES, f));
    const fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const fileChooser = await fc;
    await fileChooser.setFiles(files);

    // Wait for all decodes
    await expect(async () => {
      const statuses = await page.locator(".file-card .status").allTextContents();
      expect(statuses.every((s) => !s.includes("Decoding..."))).toBe(true);
    }).toPass({ timeout: 60000 });

    const filmstrip = page.locator("#viewer-filmstrip");
    await expect(filmstrip).toBeVisible();

    // Decoder UI pass: the scroll container is now the inner rail
    // (#filmstripTrack) so the count pill can stay pinned outside it.
    const track = page.locator("#filmstripTrack");
    const overflow = await track.evaluate((el) => ({
      overflowX: getComputedStyle(el).overflowX,
      scrolls: el.scrollWidth > el.clientWidth,
    }));
    expect(["auto", "scroll"]).toContain(overflow.overflowX);
    expect(overflow.scrolls).toBe(true);
  });

  // F04: the toolbar segmented control is the ZIP format; per-card selects
  // are "Save as" and follow the toolbar default, while a per-card change
  // still only affects that card.
  test("toolbar ZIP format syncs the per-card Save as controls", async ({ page }) => {
    const fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    const fileChooser = await fc;
    await fileChooser.setFiles([path.join(FIXTURES, "test1.ithmb")]);

    await expect(async () => {
      const statuses = await page.locator(".file-card .status").allTextContents();
      expect(statuses.every((s) => !s.includes("Decoding..."))).toBe(true);
    }).toPass({ timeout: 60000 });

    // The two scopes are labelled: toolbar = ZIP format, card = Save as.
    await expect(page.locator(".toolbar__fmt-label")).toHaveText("ZIP format");
    await expect(page.locator(".file-card .actions-label").first()).toHaveText("Save as");

    // Baseline: card select defaults to JPEG, save button says Save JPEG
    const cardSelect = page.locator("select.fmt-select").first();
    const saveBtn = page.locator("[data-save]").first();
    await expect(cardSelect).toHaveValue("image/jpeg");
    await expect(saveBtn).toHaveText("Save JPEG");

    // Changing the ZIP format also updates the per-card Save as default.
    await page.locator('#fmtSeg [data-format="image/png"]').click();
    await expect(page.locator("#downloadAllBtn")).toHaveAttribute("title", /PNG/);
    await expect(page.locator("#downloadFormatSelect")).toHaveValue("image/png");
    await expect(page.locator('#fmtSeg [data-format="image/png"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(cardSelect).toHaveValue("image/png");
    await expect(saveBtn).toHaveText("Save PNG");

    // Changing the PER-CARD Save as must NOT touch the toolbar/ZIP control.
    await cardSelect.selectOption("image/bmp");
    await expect(saveBtn).toHaveText("Save BMP");
    await expect(page.locator("#downloadFormatSelect")).toHaveValue("image/png");
    await expect(page.locator("#downloadAllBtn")).toHaveAttribute("title", /PNG/);
  });
});
