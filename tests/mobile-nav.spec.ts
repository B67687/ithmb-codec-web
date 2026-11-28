/**
 * Mobile navigation regression tests.
 *
 * Guards the hamburger panel: at ≤480px the whole `.top-nav-links` element
 * (id `topNavPanel`) is the disclosure panel. It must actually become visible
 * when `body.nav-open` is set — a CSS rule once hid its own container, so the
 * button toggled state but the panel stayed 0×0.
 */
import { expect, test } from "@playwright/test";

test.describe("Mobile navigation", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("hamburger opens the panel below the nav", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const toggle = page.locator("#navToggle");
    const panel = page.locator("#topNavPanel");

    await expect(toggle).toBeVisible();
    await expect(panel).toBeHidden();

    await toggle.click();

    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(panel).toBeVisible();

    const box = await panel.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(380);
    expect(box!.height).toBeGreaterThan(0);

    await expect(panel.locator("a").first()).toBeVisible();
  });

  test("Escape closes the panel and returns focus to the toggle", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const toggle = page.locator("#navToggle");
    await toggle.click();
    await expect(page.locator("#topNavPanel")).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#topNavPanel")).toBeHidden();
    await expect(toggle).toBeFocused();
  });

  test("no duplicate bottom bar is injected", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("nav.top-nav");
    await expect(page.locator("nav.bottombar")).toHaveCount(0);
  });
});
