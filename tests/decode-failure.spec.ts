import path from "path";
// decode-failure.spec.ts — W3-cover: the two decoder branches ithmb-decoder.spec.ts
// never exercises (null result -> failure card, exception -> error card).
// Regression anchor: decoder.decodeFailed / decoder.unknownFormat keys were missing
// from locales, so these branches rendered raw key text (t() falls back to key).
import { expect, test } from "@playwright/test";

async function upload(page: import("@playwright/test").Page, file: string) {
  const fp = path.resolve(__dirname, "./fixtures", file);
  const chooser = page.waitForEvent("filechooser");
  await page.locator("#dropzone").click();
  await (await chooser).setFiles(fp);
}

test.describe("decode failure paths", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/ithmb-decoder/");
    await page.waitForSelector("#dropzone");
  });

  test("truncated file shows failure card with human text", async ({ page }) => {
    await upload(page, "truncated.ithmb");
    const card = page.locator(".file-card").first();
    await card.waitFor();
    await expect(card.locator(".status.err")).toBeVisible();
    await expect(card.getByText("Decode failed")).toBeVisible();
    await expect(card.getByText("decoder.decodeFailed")).toHaveCount(0);
  });

  test("garbage file shows unknown-format card with human text", async ({ page }) => {
    await upload(page, "garbage.ithmb");
    const card = page.locator(".file-card").first();
    await card.waitFor();
    await expect(card.locator(".status.unknown")).toBeVisible();
    await expect(card.getByText("Unknown format")).toBeVisible();
    await expect(card.getByText("decoder.unknownFormat")).toHaveCount(0);
  });

  test("empty file shows error card, not a hang", async ({ page }) => {
    await upload(page, "empty.ithmb");
    const card = page.locator(".file-card").first();
    await card.waitFor();
    await expect(card.locator(".status.err, .status.unknown")).toBeVisible();
  });
});
