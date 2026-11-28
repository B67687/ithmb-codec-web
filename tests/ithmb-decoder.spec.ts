/**
 * Playwright regression test suite for the WASM decoder page.
 *
 * Tests page structure, UI elements, design tokens, and modal presence.
 * No actual file uploads — purely structural and visual verification.
 */

import { expect, test } from "@playwright/test";

const PAGE_URL = "/ithmb-decoder/";

test.describe("WASM Decoder Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#dropzone");
  });

  test.describe("Page Structure", () => {
    // Guards: zero console errors on decoder load.
    test("loads without console errors", async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });
      await page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#dropzone");
      expect(errors).toHaveLength(0);
    });

    // Guards: decoder page title.
    test("has correct title", async ({ page }) => {
      await expect(page).toHaveTitle("Free .ITHMB File Viewer | ITHMB Codec");
    });

    // Guards: the visible hero is the page's h1 (was a visually hidden h1 pre-redesign).
    test("has a visible h1 in the hero", async ({ page }) => {
      const h1 = page.locator("h1").first();
      await expect(h1).toBeVisible();
      await expect(h1).toHaveText("Free .ithmb viewer");
    });

    // Guards: body background uses --bg token.
    test("body background is --bg CSS variable", async ({ page }) => {
      const { bg, token } = await page.evaluate(() => ({
        bg: getComputedStyle(document.body).backgroundColor,
        token: getComputedStyle(document.body).getPropertyValue("--bg").trim(),
      }));
      expect(bg).toBe("rgb(255, 255, 255)");
      expect(token).toBe("#ffffff");
    });

    // Guards: dropzone present and styled as the design-lab reference card.
    test("dropzone is present with the reference surface styling", async ({ page }) => {
      const dropzone = page.locator("#dropzone");
      await expect(dropzone).toBeVisible();

      const style = await page.evaluate(() => {
        const dz = document.getElementById("dropzone");
        if (!dz) throw new Error("dropzone element not found");
        const s = getComputedStyle(dz);
        return {
          borderWidth: s.borderTopWidth,
          radius: s.borderRadius,
          background: s.backgroundColor,
          minHeight: s.minHeight,
        };
      });
      expect(style.borderWidth).toBe("0px");
      expect(style.radius).toBe("28px");
      expect(style.background).toBe("rgb(255, 255, 255)");
      expect(style.minHeight).toBe("286px");
    });

    // Guards: dropzone copy text (reference wording).
    test("dropzone has correct text content", async ({ page }) => {
      const dropzone = page.locator("#dropzone");
      await expect(dropzone).toContainText("Drop .ithmb or .ipm files");
      await expect(dropzone).toContainText("or click to browse");
      await expect(dropzone).toContainText("Decoding happens on your device");
    });

    // Guards: the sample path is surfaced from the empty state and works.
    test("hero offers a working sample file", async ({ page }) => {
      const sample = page.locator("#sampleBtn");
      await expect(sample).toBeVisible();
      await expect(sample).toHaveText("Try a sample file");
      await expect(page.locator(".sample-row")).toContainText("Read the guide");
    });

    // Guards: the no-upload promise is surfaced from the page.
    test("info section explains the no-upload promise", async ({ page }) => {
      const info = page.locator(".info-block");
      await expect(info).toContainText("A local viewer.");
      await expect(info).toContainText("Files never leave your device.");
      await expect(page.locator('footer a[href="/privacy/"]')).toBeAttached();
    });
  });

  test.describe("GitHub Corner", () => {
    // Guards: GitHub corner aria-label + href.
    test("exists with correct aria-label and href", async ({ page }) => {
      const link = page.locator("a.github-corner");
      await expect(link).toHaveAttribute("aria-label", /View source on GitHub/);
      await expect(link).toHaveAttribute("href", "https://github.com/B67687/Ithmb-Codec");
    });

    // Guards: GitHub corner is an inline nav item (not a fixed absolute overlay).
    test("is positioned in nav bar", async ({ page }) => {
      const pos = await page.evaluate(() => {
        const el = document.querySelector(".github-corner");
        if (!el) throw new Error(".github-corner element not found");
        const s = getComputedStyle(el);
        return { position: s.position, width: s.width, height: s.height };
      });
      expect(pos.position).toBe("static");
      expect(pos.width).toBe("26px");
      expect(pos.height).toBe("26px");
    });
  });

  test.describe("Support link", () => {
    // Guards: Buy Me a Coffee moved from the old nav cup to the footer support column.
    test("footer links to Buy Me a Coffee", async ({ page }) => {
      const bmc = page.locator('footer a[href="https://buymeacoffee.com/ThumbNami"]');
      await expect(bmc).toBeAttached();
      await expect(bmc).toContainText("Buy me a coffee");
    });
  });

  test.describe("Toolbar Features", () => {
    // Guards: toolbar exists, hidden initially.
    test("#toolbar element exists and is initially hidden", async ({ page }) => {
      const toolbar = page.locator("#toolbar");
      await expect(toolbar).toBeAttached();

      const hasVisible = await page.evaluate(() => {
        const el = document.getElementById("toolbar");
        if (!el) throw new Error("toolbar element not found");
        return el.classList.contains("visible");
      });
      expect(hasVisible).toBe(false);
    });

    // Guards: download-all button exists, hidden initially.
    test("#downloadAllBtn exists and is initially hidden", async ({ page }) => {
      const btn = page.locator("#toolbar #downloadAllBtn");
      await expect(btn).toBeAttached();
      await expect(btn).not.toBeVisible();
    });
  });

  test.describe("Loaded state (design-lab port)", () => {
    // Guards: one-click sample loads the reference loaded layout.
    test("sample file loads the toolbar, viewer band and results grid", async ({ page }) => {
      await page.locator("#sampleBtn").click();
      await expect(page.locator("#loaded")).toBeVisible({ timeout: 30000 });
      await expect(page.locator("#toolbar")).toHaveClass(/visible/);
      await expect(page.locator("#tbFile")).toHaveText("sample.ithmb");
      await expect(page.locator("#tbMeta")).toContainText(/image/);
      // Full-bleed black viewer band with the meta pill.
      await expect(page.locator("#viewer-container")).toBeVisible();
      await expect(page.locator("#viewer-header")).toContainText("sample.ithmb");
      await expect(page.locator("#viewer-header")).toContainText("RGB555");
      // Results grid + its meta line.
      await expect(page.locator("#file-list .file-card")).toHaveCount(1);
      await expect(page.locator(".results-head")).toContainText("Decoded images");
      await expect(page.locator("#resultsMeta")).toContainText(/image/);
      // The drop card is gone once results exist.
      await expect(page.locator("#dropzone")).not.toBeVisible();
    });

    // Guards: segmented format control + Download all live in the toolbar.
    test("toolbar exposes the reference controls", async ({ page }) => {
      await page.locator("#sampleBtn").click();
      await expect(page.locator("#loaded")).toBeVisible({ timeout: 30000 });
      await expect(page.locator("#fmtSeg button")).toHaveCount(4);
      await expect(page.locator("#fmtSeg .is-on")).toHaveText("JPEG");
      await expect(page.locator("#downloadAllBtn")).toBeVisible();
      await expect(page.locator("#downloadAllBtn")).toContainText("Download all");
      await expect(page.locator("#clearBtn")).toHaveText("Clear");
    });

    // Guards: info section copy is the reference copy (not the old SEO stack).
    test("info section matches the reference copy", async ({ page }) => {
      const info = page.locator(".info-block");
      await expect(info).toContainText("How it works");
      await expect(info).toContainText("A local viewer.");
      await expect(info.locator(".info-tips li")).toHaveCount(4);
    });
  });

  test.describe("Footer", () => {
    // Guards: footer column structure (redesigned chrome).
    test("has product and project link columns", async ({ page }) => {
      const footer = page.locator("footer");
      await expect(footer).toContainText("Product");
      await expect(footer).toContainText("Project");
      await expect(footer).toContainText("Support");
    });

    // Guards: footer repo link.
    test("links to Ithmb-Codec GitHub repo", async ({ page }) => {
      const link = page.locator('footer a[href="https://github.com/B67687/Ithmb-Codec"]').first();
      await expect(link).toBeAttached();
    });
  });

  test.describe("Design tokens", () => {
    // Guards: --bg token value (redesigned canvas).
    test("--bg is #ffffff", async ({ page }) => {
      const val = await page.evaluate(() =>
        getComputedStyle(document.body).getPropertyValue("--bg").trim(),
      );
      expect(val).toBe("#ffffff");
    });

    // Guards: --accent token value (redesigned Apple blue).
    test("--accent is #0071e3", async ({ page }) => {
      const val = await page.evaluate(() =>
        getComputedStyle(document.body).getPropertyValue("--accent").trim(),
      );
      expect(val).toBe("#0071e3");
    });

    // Guards: --surface token value.
    test("--surface is #ffffff", async ({ page }) => {
      const val = await page.evaluate(() =>
        getComputedStyle(document.body).getPropertyValue("--surface").trim(),
      );
      expect(val).toBe("#ffffff");
    });
  });
});
