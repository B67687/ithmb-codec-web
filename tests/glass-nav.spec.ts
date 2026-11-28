// Glass nav (approved Medium level): scrolled state toggles glass without any
// layout shift, at desktop/tablet/mobile widths.
import { expect, test } from "@playwright/test";
import { waitDecodeSettled } from "./helpers";

const VIEWPORTS = [
  { width: 1440, height: 900, label: "desktop" },
  { width: 1024, height: 900, label: "tablet" },
  { width: 390, height: 844, label: "mobile" },
];

for (const vp of VIEWPORTS) {
  test(`nav glass toggles on scroll without layout shift (${vp.label})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/", { waitUntil: "networkidle" });

    const navState = () =>
      page.evaluate(() => {
        const nav = document.querySelector(".top-nav")!;
        const r = nav.getBoundingClientRect();
        const cs = getComputedStyle(nav);
        const webkit = (cs as unknown as Record<string, string>)["-webkit-backdrop-filter"];
        return {
          top: Math.round(r.top),
          height: Math.round(r.height),
          isScrolled: document.body.classList.contains("is-scrolled"),
          bg: cs.backgroundColor,
          blur: cs.backdropFilter || webkit || "none",
        };
      });

    const atTop = await navState();
    expect(atTop.isScrolled).toBe(false);
    // At the top: near-opaque, no backdrop work.
    expect(atTop.blur).toBe("none");

    await page.evaluate(() => window.scrollTo(0, 700));
    // The state is rAF-throttled; poll it instead of sleeping a fixed 250 ms.
    await expect.poll(async () => (await navState()).isScrolled, { timeout: 5000 }).toBe(true);
    const scrolled = await navState();
    expect(scrolled.isScrolled).toBe(true);
    // No layout shift when the glass class applies.
    expect(scrolled.height).toBe(atTop.height);
    expect(scrolled.top).toBe(atTop.top);
    // Back at the top the state resets.
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(async () => (await navState()).isScrolled, { timeout: 5000 }).toBe(false);
  });
}

test("glass surfaces report a backdrop filter when the browser supports it", async ({ page }) => {
  await page.goto("/ithmb-decoder/", { waitUntil: "networkidle" });
  const supported = await page.evaluate(
    () =>
      CSS.supports("backdrop-filter", "blur(1px)") ||
      CSS.supports("-webkit-backdrop-filter", "blur(1px)"),
  );
  test.skip(!supported, "browser has no backdrop-filter support");
  await page.setInputFiles("#fileInput", [
    require("node:path").join(__dirname, "fixtures/test1.ithmb"),
  ]);
  await waitDecodeSettled(page, 1);
  const blur = () =>
    page.evaluate(() => {
      const el = document.querySelector("#viewer-header")!;
      const cs = getComputedStyle(el);
      const webkit = (cs as unknown as Record<string, string>)["-webkit-backdrop-filter"];
      return cs.backdropFilter || webkit || "none";
    });
  await expect.poll(blur, { timeout: 10000 }).toContain("blur(16px)");
});
