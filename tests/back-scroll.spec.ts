// Fix pass 2: Back-navigation scroll restoration at desktop and mobile widths.
import { expect, test } from "@playwright/test";

for (const viewport of [
  { width: 1440, height: 900, label: "desktop" },
  { width: 390, height: 844, label: "mobile" },
]) {
  test("Back restores scroll position (" + viewport.label + ")", async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/guide/how-to-open-ithmb-files.html", { waitUntil: "networkidle" });
    await page.evaluate(() => window.scrollTo(0, 1500));
    await expect
      .poll(() => page.evaluate(() => window.scrollY), { timeout: 5000 })
      .toBeGreaterThan(600);
    const before = await page.evaluate(() => window.scrollY);

    // Click through the DOM so Playwright does not auto-scroll the footer into
    // view — we want the scroll position at navigation time to be `before`.
    const navigated = page.waitForURL(/\/privacy\//, { timeout: 15000 });
    await page.evaluate(() => {
      const link = document.querySelector<HTMLAnchorElement>(".site-footer a[href='/privacy/']");
      link?.click();
    });
    await navigated;
    await page.goBack({ waitUntil: "domcontentloaded" });

    // Native restoration is async: poll until the restored offset is back in
    // the allowed window, then assert the window itself.
    await expect
      .poll(() => page.evaluate(() => window.scrollY), { timeout: 10000 })
      .toBeGreaterThan(before - 180);
    const after = await page.evaluate(() => window.scrollY);
    expect(Math.abs(after - before)).toBeLessThan(180);
  });
}
