// Post-launch UI fixes: Add files alignment, home mock surface, copy-button
// reset and small state-sweep regressions.
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { waitDecodeSettled } from "./helpers";

const FIX = path.join(__dirname, "fixtures");

async function loadOne(page: Page): Promise<void> {
  await page.goto("/ithmb-decoder/", { waitUntil: "networkidle" });
  await page.setInputFiles("#fileInput", [path.join(FIX, "test1.ithmb")]);
  await waitDecodeSettled(page, 1);
}

test.describe("Post-launch UI fixes", () => {
  test("Add files is a label-only pill vertically aligned with the meta line", async ({ page }) => {
    for (const [width, height] of [
      [1440, 900],
      [1024, 768],
      [390, 844],
      [320, 568],
    ] as const) {
      await page.setViewportSize({ width, height });
      await loadOne(page);
      await expect(page.locator("#addFilesBtn")).toHaveText(/Add files|添加文件/);
      expect(await page.locator("#addFilesBtn svg").count()).toBe(0);
      const m = await page.evaluate(() => {
        const meta = document.getElementById("tbMeta")!.getBoundingClientRect();
        const btnEl = document.getElementById("addFilesBtn")!;
        const btn = btnEl.getBoundingClientRect();
        const span = btnEl.querySelector("span")!.getBoundingClientRect();
        const cs = getComputedStyle(btnEl);
        const card = document.querySelector(".file-card")!.getBoundingClientRect();
        const overlap = [
          "#prevBtn",
          "#nextBtn",
          "#viewer-filmstrip",
          "#viewerPos",
          ".toolbar__actions",
        ]
          .map((s) => document.querySelector(s))
          .filter((el): el is Element => !!el)
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return (
              btn.right > r.left && btn.left < r.right && btn.bottom > r.top && btn.top < r.bottom
            );
          }).length;
        return {
          metaCenter: meta.top + meta.height / 2,
          btnCenter: btn.top + btn.height / 2,
          spanCenter: span.top + span.height / 2,
          btnHeight: btn.height,
          alignItems: cs.alignItems,
          lineHeight: cs.lineHeight,
          overlap,
          cardInside: card.width > 0,
        };
      });
      expect(m.cardInside).toBe(true);
      expect(Math.abs(m.metaCenter - m.btnCenter)).toBeLessThanOrEqual(2);
      // The glyph/text must be centred in the pill itself, not just the pill on
      // the meta line (place-items:initial used to reset align-items; the old
      // label sat high with a 12px line box).
      expect(Math.abs(m.spanCenter - m.btnCenter)).toBeLessThanOrEqual(1);
      expect(m.alignItems).toBe("center");
      expect(parseFloat(m.lineHeight)).toBeGreaterThanOrEqual(13);
      expect(m.overlap).toBe(0);
      if (width <= 560) expect(m.btnHeight).toBeGreaterThanOrEqual(44);
    }
  });

  test("home mock Add files uses a neutral surface (no floating grey pill)", async ({ page }) => {
    for (const url of ["/", "/zh/"]) {
      await page.goto(url, { waitUntil: "networkidle" });
      const m = await page.evaluate(() => {
        const add = document.querySelector(".app-mock__file .app-mock__add")!;
        const cs = getComputedStyle(add);
        return {
          count: document.querySelectorAll(".app-mock__file .app-mock__meta").length,
          filemeta: !!document.querySelector(".app-mock__file .app-mock__filemeta"),
          bg: cs.backgroundColor,
          radius: cs.borderRadius,
        };
      });
      expect(m.count).toBe(0);
      expect(m.filemeta).toBe(true);
      expect(m.bg).toBe("rgba(0, 0, 0, 0)");
    }
  });

  test("copy buttons reset after 1.5 s, replace timers and stay independent", async ({ page }) => {
    // Fake timers: the reset is a plain 1.5 s timeout, so advancing the clock
    // proves the timing without sleeping through it (and without wall-clock
    // jitter on loaded CI runners).
    await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: () => Promise.resolve() },
      });
    });
    await page.goto("/guide/how-to-open-ithmb-files", { waitUntil: "networkidle" });
    const buttons = page.locator(".guide-copy");
    const first = buttons.nth(0);
    const second = buttons.nth(1);
    await expect(first.locator(".guide-copy__hint")).toHaveText("Copy");

    await first.click();
    await expect(first.locator(".guide-copy__hint")).toHaveText("Copied");
    await page.clock.runFor(600);
    await expect(first.locator(".guide-copy__hint")).toHaveText("Copied");
    await page.clock.runFor(1000);
    await expect(first.locator(".guide-copy__hint")).toHaveText("Copy");

    // Repeated click while "Copied" must not capture the transient label as
    // the original (the old bug left it stuck on "Copied").
    await first.click();
    await page.clock.runFor(200);
    await first.click();
    await page.clock.runFor(1000);
    await expect(first.locator(".guide-copy__hint")).toHaveText("Copied");
    await page.clock.runFor(700);
    await expect(first.locator(".guide-copy__hint")).toHaveText("Copy");

    // Independent timers: clicking two chips doesn't reset the first one early.
    await first.click();
    await second.click();
    await expect(first.locator(".guide-copy__hint")).toHaveText("Copied");
    await expect(second.locator(".guide-copy__hint")).toHaveText("Copied");
    await page.clock.runFor(1600);
    await expect(first.locator(".guide-copy__hint")).toHaveText("Copy");
    await expect(second.locator(".guide-copy__hint")).toHaveText("Copy");

    // Accessible live confirmation exists and was announced.
    const live = page.locator(".guide-copy__live");
    await expect(live).toHaveCount(1);
    await expect(live).toHaveAttribute("role", "status");
    await expect(live).toHaveAttribute("aria-live", "polite");
  });

  test("confirmation dialog cannot double-open and always settles", async ({ page }) => {
    await loadOne(page);
    // Two rapid Clear requests (programmatic, so the second lands on the real
    // button rather than the newly opened backdrop). The guard must settle the
    // first promise and leave exactly one active dialog.
    await page.evaluate(() => {
      const btn = document.getElementById("clearBtn")!;
      btn.click();
      btn.click();
    });
    await expect(page.locator("#confirmDialog")).toHaveClass(/active/);
    expect(await page.locator("#confirmDialog").count()).toBe(1);
    await page.keyboard.press("Escape");
    await expect(page.locator("#confirmDialog")).not.toHaveClass(/active/);
    await expect(page.locator("body")).not.toHaveClass(/modal-open/);
  });
});
