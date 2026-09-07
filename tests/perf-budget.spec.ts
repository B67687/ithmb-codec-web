import path from "node:path";
// Perf budgets (W1): Playwright-native, Chromium-only, zero new deps.
// Asserts transfer-size + timing ceilings so perf (currently PSI 1.0)
// cannot regress silently. Provisional budgets — tightened after first
// local baseline run. Skipped on firefox/webkit (timing noise).
import { type Page, type Response, expect, test } from "@playwright/test";

test.skip(
  ({ browserName }) => browserName !== "chromium",
  "perf budgets are Chromium-only (timing stability)",
);

async function measure(page: Page, url: string) {
  const bytes = { js: 0, wasm: 0, total: 0 };
  page.on("response", async (res: Response) => {
    try {
      const buf = await res.body();
      const n = buf.length;
      bytes.total += n;
      const u = res.url();
      if (u.endsWith(".wasm")) bytes.wasm += n;
      else if (/\.(js|mjs)(\?|$)/.test(u)) bytes.js += n;
    } catch {
      // cached / failed bodies contribute 0 — same each run
    }
  });
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "networkidle" });
  const wall = Date.now() - t0;
  const timing = await page.evaluate(() => {
    const entries = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    const nav = entries[0];
    if (!nav) throw new Error("no navigation entry");
    return {
      domContentLoaded: nav.domContentLoadedEventEnd,
      load: nav.loadEventEnd,
    };
  });
  return { bytes, wall, timing };
}

test.describe("Perf budgets", () => {
  test("home page within budget", async ({ page }) => {
    const m = await measure(page, "/");
    console.log("PERF home:", JSON.stringify(m));
    expect(m.bytes.js).toBeLessThan(100_000);
    expect(m.bytes.total).toBeLessThan(600_000);
    expect(m.timing.load).toBeLessThan(3_000);
  });

  test("decoder page within budget (incl WASM)", async ({ page }) => {
    const bytes = { js: 0, wasm: 0, total: 0 };
    page.on("response", async (res) => {
      try {
        const buf = await res.body();
        const n = buf.length;
        bytes.total += n;
        const u = res.url();
        if (/\.wasm(\?|$)/.test(u)) bytes.wasm += n;
        else if (/\.(js|mjs)(\?|$)/.test(u)) bytes.js += n;
      } catch {
        // cached / failed bodies contribute 0 — same each run
      }
    });
    await page.goto("/ithmb-decoder/", { waitUntil: "networkidle" });
    // WASM lazy-loads on first decode — upload to trigger it.
    const fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    await (await fc).setFiles(path.resolve(__dirname, "fixtures/test1.ithmb"));
    await expect(page.locator(".file-card")).toHaveCount(1);
    await expect(async () => {
      const s = await page.locator(".file-card .status").allTextContents();
      expect(s.every((t) => !t.includes("Decoding..."))).toBe(true);
    }).toPass({ timeout: 60000 });
    console.log("PERF decoder:", JSON.stringify(bytes));
    expect(bytes.wasm).toBeGreaterThan(0); // WASM must actually load
    expect(bytes.wasm).toBeLessThan(400_000);
    expect(bytes.js).toBeLessThan(300_000);
    expect(bytes.total).toBeLessThan(1_500_000);
  });
});
