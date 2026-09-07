import { expect, test } from "@playwright/test";

test.describe("Landing page", () => {
  test("loads and shows ITHMB title", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator("h2").first()).toContainText("ITHMB Decoder");
  });

  test("has links to decoder and enterprise", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator('a.card[href*="ithmb-decoder"]')).toBeVisible();
    await expect(page.locator('a.card[href*="enterprise"]')).toBeVisible();
  });
});

test.describe("Landing page subtitle centering", () => {
  test("EN subtitle is horizontally centered", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    const box = await page.locator(".subtitle").boundingBox();
    expect(box).not.toBeNull();
    const vw = await page.evaluate(() => document.documentElement.clientWidth);
    expect(Math.abs(box!.x - (vw - box!.x - box!.width))).toBeLessThan(2);
  });

  test("zh subtitle is horizontally centered (not broken by :lang(zh) p margin)", async ({
    page,
  }) => {
    await page.goto("/zh/", { waitUntil: "networkidle" });
    const box = await page.locator(".subtitle").boundingBox();
    expect(box).not.toBeNull();
    const vw = await page.evaluate(() => document.documentElement.clientWidth);
    expect(Math.abs(box!.x - (vw - box!.x - box!.width))).toBeLessThan(2);
  });
});

test.describe("Enterprise page", () => {
  test("loads with correct title", async ({ page }) => {
    await page.goto("/enterprise/", {
      waitUntil: "networkidle",
    });
    await expect(page).toHaveTitle(/Enterprise/);
  });

  test("has hero section", async ({ page }) => {
    await page.goto("/enterprise/", {
      waitUntil: "networkidle",
    });
    await expect(page.locator("div.construction")).toBeVisible();
  });
});

test.describe("Guide page", () => {
  test("loads with correct title", async ({ page }) => {
    await page.goto("/guide/how-to-open-ithmb-files.html", {
      waitUntil: "networkidle",
    });
    await expect(page).toHaveTitle(/How to Open/);
  });

  test("has FAQ heading", async ({ page }) => {
    await page.goto("/guide/how-to-open-ithmb-files.html", {
      waitUntil: "networkidle",
    });
    await expect(page.locator("h2").filter({ hasText: "Frequently" })).toBeVisible();
  });
});
