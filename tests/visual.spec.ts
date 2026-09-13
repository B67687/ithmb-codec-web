/**
 * Visual regression test suite.
 * Catches unintended visual changes (CSS cascade bugs, broken icons, layout shifts).
 *
 * Run once to generate baselines:
 *   npx playwright test tests/visual.spec.ts --update-snapshots
 *
 * Run normally to compare:
 *   npx playwright test tests/visual.spec.ts
 */
import { expect, test } from "@playwright/test";

test.describe("Visual Regression — Pages", () => {
  test("home page — full page", async ({ page }) => {
    await page.goto("/", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector("nav");
    await expect(page).toHaveScreenshot({
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });

  test("enterprise page — full page", async ({ page }) => {
    await page.goto("/enterprise/", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector("nav");
    await expect(page).toHaveScreenshot({
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });

  test("guide page — full page", async ({ page }) => {
    await page.goto("/guide/how-to-open-ithmb-files.html", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector("nav");
    await expect(page).toHaveScreenshot({
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });
});

test.describe("Visual Regression — Nav bar", () => {
  test("nav — home (active: Home, brand logo present)", async ({ page }) => {
    await page.goto("/", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector("nav");
    const nav = page.locator("nav");
    await expect(nav).toBeVisible();
    await expect(nav).toHaveScreenshot({ maxDiffPixelRatio: 0.01 });
  });

  test("nav — enterprise (active: Enterprise)", async ({ page }) => {
    await page.goto("/enterprise/", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector("nav");
    const nav = page.locator("nav");
    await expect(nav).toBeVisible();
    await expect(nav).toHaveScreenshot({ maxDiffPixelRatio: 0.01 });
  });

  test("nav — decoder (active: Decoder)", async ({ page }) => {
    await page.goto("/ithmb-decoder/", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector("nav");
    const nav = page.locator("nav");
    await expect(nav).toBeVisible();
    await expect(nav).toHaveScreenshot({ maxDiffPixelRatio: 0.01 });
  });

  test("nav — guide (active: Guide)", async ({ page }) => {
    await page.goto("/guide/how-to-open-ithmb-files.html", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector("nav");
    const nav = page.locator("nav");
    await expect(nav).toBeVisible();
    await expect(nav).toHaveScreenshot({ maxDiffPixelRatio: 0.01 });
  });
});

test.describe("Visual Regression — Footer", () => {
  test("footer — enterprise page (should show BMC icon inside container)", async ({ page }) => {
    await page.goto("/enterprise/", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector("nav");
    const footer = page.locator("footer");
    await expect(footer).toBeVisible();
    await expect(footer).toHaveScreenshot({ maxDiffPixelRatio: 0.01 });
  });
});
