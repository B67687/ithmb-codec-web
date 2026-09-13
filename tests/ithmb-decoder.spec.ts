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
      await expect(page).toHaveTitle("Free .ITHMB File Viewer & Converter | ITHMB Codec");
    });

    // Guards: body background uses --bg token.
    test("body background is --bg CSS variable", async ({ page }) => {
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(bg).toBe("rgb(245, 245, 247)");
    });

    // Guards: dropzone present and styled.
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

    // Guards: dropzone copy text.
    test("dropzone has correct text content", async ({ page }) => {
      const dropzone = page.locator("#dropzone");
      await expect(dropzone).toContainText("Drop .ithmb or .ipm files here");
      await expect(dropzone).toContainText("or click to browse");
    });
  });

  test.describe("GitHub Corner", () => {
    // Guards: GitHub corner aria-label + href.
    test("exists with correct aria-label and href", async ({ page }) => {
      const link = page.locator("a.github-corner");
      await expect(link).toHaveAttribute("aria-label", "View source on GitHub");
      await expect(link).toHaveAttribute("href", "https://github.com/B67687/Ithmb-Codec");
    });

    // Guards: GitHub corner nav positioning.
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
    // Guards: BMC button class, href, icon.
    test("exists with class, href, and SVG icon", async ({ page }) => {
      const bmc = page.locator(".bmc-corner");
      await expect(bmc).toHaveAttribute("href", "https://buymeacoffee.com/ThumbNami");
      await expect(bmc.locator("img")).toBeAttached();
    });

    // Guards: BMC positioned next to GitHub corner.
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

    // Guards: no batch-share checkbox (deliberate absence).
    test("no batch-share checkbox exists in toolbar", async ({ page }) => {
      await expect(page.locator("#toolbar .batch-toggle")).toHaveCount(0);
      await expect(page.locator("#batchShareCheck")).toHaveCount(0);
    });

    // Guards: download-all button exists, hidden initially.
    test("#downloadAllBtn exists and is initially hidden", async ({ page }) => {
      const btn = page.locator("#toolbar #downloadAllBtn");
      await expect(btn).toBeAttached();
      await expect(btn).not.toBeVisible();
    });
  });

  test.describe("Footer", () => {
    // Guards: footer Ithmb-Codec credit.
    test('mentions "Powered by Ithmb-Codec"', async ({ page }) => {
      await expect(page.locator("footer")).toContainText("Powered by Ithmb-Codec");
    });

    // Guards: footer repo link.
    test("links to Ithmb-Codec GitHub repo", async ({ page }) => {
      const link = page.locator("footer a").first();
      await expect(link).toHaveAttribute("href", "https://github.com/B67687/Ithmb-Codec");
    });
  });

  test.describe("CSS Variables Applied", () => {
    // Guards: --bg token value.
    test("--bg is #f5f5f7", async ({ page }) => {
      const val = await page.evaluate(() => {
        const style = getComputedStyle(document.body);
        return style.getPropertyValue("--bg").trim();
      });
      expect(val).toBe("#f5f5f7");
    });

    // Guards: --accent token value.
    test("--accent is #007AFF", async ({ page }) => {
      const val = await page.evaluate(() => {
        const style = getComputedStyle(document.body);
        return style.getPropertyValue("--accent").trim();
      });
      expect(val).toBe("#007aff");
    });

    // Guards: --surface token value.
    test("--surface is #fff", async ({ page }) => {
      const val = await page.evaluate(() => {
        const style = getComputedStyle(document.body);
        return style.getPropertyValue("--surface").trim();
      });
      expect(val).toBe("#fff");
    });
  });
});
