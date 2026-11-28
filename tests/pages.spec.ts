import { expect, test } from "@playwright/test";

test.describe("Landing page", () => {
  // Guards: home hero title.
  test("loads and shows the ITHMB Codec hero", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("nav");
    await expect(page.locator("h1").first()).toContainText("ITHMB Codec");
  });

  // Guards: primary nav links.
  test("has links to decoder and guide", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("nav");
    await expect(page.locator('a.card[href*="ithmb-decoder"]')).toBeVisible();
    await expect(page.locator('a.card[href*="guide"]')).toBeVisible();
  });
});

test.describe("Landing page subtitle centering", () => {
  // Regression: EN subtitle centering (visual era).
  test("EN subtitle is horizontally centered", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("nav");
    const box = await page.locator(".subtitle").boundingBox();
    expect(box).not.toBeNull();
    const vw = await page.evaluate(() => document.documentElement.clientWidth);
    expect(Math.abs(box!.x - (vw - box!.x - box!.width))).toBeLessThan(2);
  });

  // Regression: :lang(zh) margin broke zh centering (W2).
  test("zh subtitle is horizontally centered (not broken by :lang(zh) p margin)", async ({
    page,
  }) => {
    await page.goto("/zh/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("nav");
    const box = await page.locator(".subtitle").boundingBox();
    expect(box).not.toBeNull();
    const vw = await page.evaluate(() => document.documentElement.clientWidth);
    expect(Math.abs(box!.x - (vw - box!.x - box!.width))).toBeLessThan(2);
  });
});

test.describe("Guide page", () => {
  // Guards: guide page title.
  test("loads with correct title", async ({ page }) => {
    await page.goto("/guide/how-to-open-ithmb-files.html", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector("nav");
    await expect(page).toHaveTitle(/How to Open/);
  });

  // Guards: guide FAQ heading.
  test("has FAQ heading", async ({ page }) => {
    await page.goto("/guide/how-to-open-ithmb-files.html", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector("nav");
    await expect(page.locator("h2").filter({ hasText: "Frequently" })).toBeVisible();
  });
});
