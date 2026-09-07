/**
 * Playwright regression test suite for the WASM decoder page.
 *
 * Tests page structure, UI elements, CSS variables, and modal presence.
 * No actual file uploads — purely structural and visual verification.
 */

import { expect, test } from "@playwright/test";

const PAGE_URL = "/ithmb-decoder/";

test.describe("WASM Decoder Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PAGE_URL, { waitUntil: "networkidle" });
  });

  test.describe("Page Structure", () => {
    test("loads without console errors", async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });
      await page.goto(PAGE_URL, { waitUntil: "networkidle" });
      expect(errors).toHaveLength(0);
    });

    test("has correct title", async ({ page }) => {
      await expect(page).toHaveTitle("Free .ITHMB File Viewer & Converter | ITHMB Codec");
    });

    test("body background is --bg CSS variable", async ({ page }) => {
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(bg).toBe("rgb(245, 245, 247)");
    });

    test("dropzone is present with correct styling", async ({ page }) => {
      const dropzone = page.locator("#dropzone");
      await expect(dropzone).toBeVisible();

      const border = await page.evaluate(() => {
        const dz = document.getElementById("dropzone");
        if (!dz) throw new Error("dropzone element not found");
        return getComputedStyle(dz).border;
      });
      // border may be rendered as shorthand or longhand; check components
      expect(border).toContain("2px");
      expect(border).toContain("dashed");
      expect(border).toContain("rgb(0, 122, 255)");
    });

    test("dropzone has correct text content", async ({ page }) => {
      const dropzone = page.locator("#dropzone");
      await expect(dropzone).toContainText("Drop .ithmb or .ipm files here");
      await expect(dropzone).toContainText("or click to browse");
    });
  });

  test.describe("GitHub Corner", () => {
    test("exists with correct aria-label and href", async ({ page }) => {
      const link = page.locator("a.github-corner");
      await expect(link).toHaveAttribute("aria-label", "View source on GitHub");
      await expect(link).toHaveAttribute("href", "https://github.com/B67687/Ithmb-Codec");
    });

    test("is positioned in nav bar", async ({ page }) => {
      const pos = await page.evaluate(() => {
        const el = document.querySelector(".github-corner");
        if (!el) throw new Error(".github-corner element not found");
        const s = getComputedStyle(el);
        return {
          position: s.position,
          width: s.width,
          height: s.height,
          color: s.color,
        };
      });
      expect(pos.position).toBe("static");
      expect(pos.width).toBe("32px");
      expect(pos.height).toBe("32px");
      expect(pos.color).toBe("rgb(134, 134, 139)");
    });
  });

  test.describe("Buy Me a Coffee Button", () => {
    test("exists with class, href, and SVG icon", async ({ page }) => {
      const bmc = page.locator(".bmc-corner");
      await expect(bmc).toHaveAttribute("href", "https://buymeacoffee.com/ThumbNami");
      await expect(bmc.locator("img")).toBeAttached();
    });

    test("is positioned in nav bar next to GitHub corner", async ({ page }) => {
      const pos = await page.evaluate(() => {
        const el = document.querySelector(".bmc-corner");
        if (!el) throw new Error(".bmc-corner element not found");
        const s = getComputedStyle(el);
        return {
          position: s.position,
        };
      });
      expect(pos.position).toBe("static");
    });
  });

  test.describe("Toolbar Features", () => {
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

    test("no batch-share checkbox exists in toolbar", async ({ page }) => {
      await expect(page.locator("#toolbar .batch-toggle")).toHaveCount(0);
      await expect(page.locator("#batchShareCheck")).toHaveCount(0);
    });

    test("#downloadAllBtn exists and is initially hidden", async ({ page }) => {
      const btn = page.locator("#toolbar #downloadAllBtn");
      await expect(btn).toBeAttached();
      await expect(btn).not.toBeVisible();
    });
  });

  test.describe("Footer", () => {
    test('mentions "Powered by Ithmb-Codec"', async ({ page }) => {
      await expect(page.locator("footer")).toContainText("Powered by Ithmb-Codec");
    });

    test("links to Ithmb-Codec GitHub repo", async ({ page }) => {
      const link = page.locator("footer a").first();
      await expect(link).toHaveAttribute("href", "https://github.com/B67687/Ithmb-Codec");
    });
  });

  test.describe("CSS Variables Applied", () => {
    test("--bg is #f5f5f7", async ({ page }) => {
      const val = await page.evaluate(() => {
        const style = getComputedStyle(document.body);
        return style.getPropertyValue("--bg").trim();
      });
      expect(val).toBe("#f5f5f7");
    });

    test("--accent is #007AFF", async ({ page }) => {
      const val = await page.evaluate(() => {
        const style = getComputedStyle(document.body);
        return style.getPropertyValue("--accent").trim();
      });
      expect(val).toBe("#007aff");
    });

    test("--surface is #fff", async ({ page }) => {
      const val = await page.evaluate(() => {
        const style = getComputedStyle(document.body);
        return style.getPropertyValue("--surface").trim();
      });
      expect(val).toBe("#fff");
    });
  });
});
