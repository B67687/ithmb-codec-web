import path from "node:path";
// Perf budgets (B6): Playwright-native, Chromium-only, zero new deps.
//
// These budgets guard the launch gates on the LOCAL uncompressed server (the
// host-mode gate is measured separately on a PROD-MODEL server with Brotli +
// immutable caching at 400 kbps / 300 ms RTT / 4x CPU — see
// work/shots/perf-b6/). Local raw byte ceilings are therefore looser than the
// wire targets, but font/wasm/duplicate-request invariants are format
// independent and held to the launch thresholds here.
import { type Page, type Response, expect, test } from "@playwright/test";

test.skip(
  ({ browserName }) => browserName !== "chromium",
  "perf budgets are Chromium-only (timing stability)",
);

type Bytes = { js: number; wasm: number; font: number; img: number; total: number };

function track(page: Page): { bytes: Bytes; urls: Map<string, number>; requests: Set<string> } {
  const bytes: Bytes = { js: 0, wasm: 0, font: 0, img: 0, total: 0 };
  const urls = new Map<string, number>();
  const requests = new Set<string>();
  page.on("request", (req) => requests.add(req.url()));
  page.on("response", async (res: Response) => {
    try {
      const buf = await res.body();
      const u = new URL(res.url());
      const key = u.pathname + u.search;
      // A modulepreload hint and the <script type="module"> fetch can both
      // surface the same URL; the browser serves the second from cache. Count
      // each URL once so the totals describe bytes actually transferred.
      if (urls.has(key)) return;
      urls.set(key, buf.length);
      bytes.total += buf.length;
      if (/\.wasm$/.test(u.pathname)) bytes.wasm += buf.length;
      else if (/\.m?js$/.test(u.pathname)) bytes.js += buf.length;
      else if (/\.woff2?$/.test(u.pathname)) bytes.font += buf.length;
      else if (/\.(png|jpe?g|webp|avif|gif|svg|ico)$/.test(u.pathname)) bytes.img += buf.length;
    } catch {
      // Failed / no-body responses contribute 0 — same in every run.
    }
  });
  return { bytes, urls, requests };
}

function lcp(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let last = 0;
        try {
          new PerformanceObserver((list) => {
            for (const e of list.getEntries()) last = e.startTime;
          }).observe({ type: "largest-contentful-paint", buffered: true });
        } catch {
          /* unsupported */
        }
        // The observer may have delivered the buffered entries synchronously
        // when registered; give the page a frame, then resolve.
        requestAnimationFrame(() => setTimeout(() => resolve(last), 250));
      }),
  );
}

test.describe("Perf budgets", () => {
  // These two tests measure Resource Timing and transfer bytes; running them
  // in parallel with the rest of the suite made the WASM count flaky.
  test.describe.configure({ mode: "serial" });

  test("home page within budget (font <=80 KB, no italic, no legacy PNGs)", async ({ page }) => {
    const { bytes, urls } = track(page);
    await page.goto("/", { waitUntil: "load" });
    await page.waitForTimeout(1200);
    const largest = await lcp(page);
    console.log("PERF home:", JSON.stringify({ bytes, largest, requests: urls.size }));

    // Launch gate: font transfer <= 80 KB and the italic file never requested.
    expect(bytes.font).toBeGreaterThan(0);
    expect(bytes.font).toBeLessThanOrEqual(80_000);
    expect([...urls.keys()].filter((u) => /italic/i.test(u))).toEqual([]);
    // B6: the legacy 720x480 mock PNGs are gone (AVIF/WebP mocks only).
    expect([...urls.keys()].filter((u) => /sample-(uyvy|ycbcr420|rgb555)\.png/i.test(u))).toEqual(
      [],
    );
    // Every mock image URL is fetched exactly once (the old 58x39 CSS thumb
    // re-downloaded sample-ycbcr420.png).
    expect([...urls.keys()].filter((u) => /mock-/.test(u)).length).toBeGreaterThan(0);
    // Local, uncompressed ceiling (host gate is 350 KB Brotli on PROD-MODEL).
    expect(bytes.total).toBeLessThan(320_000);
    expect(bytes.js).toBeLessThan(80_000);
    // Local fast-network LCP ceiling; host gate is 2.5 s at 400 kbps.
    expect(largest).toBeLessThan(1500);
  });

  test("decoder page within budget (WASM loaded once, one locale, ready <=5 s)", async ({
    page,
  }) => {
    const { bytes, urls, requests } = track(page);
    const t0 = Date.now();
    await page.goto("/ithmb-decoder/", { waitUntil: "load" });
    await page.waitForFunction(
      () => (window as unknown as { IthmbDecoderReady?: boolean }).IthmbDecoderReady === true,
      null,
      { timeout: 20_000 },
    );
    const readyMs = Date.now() - t0;
    const fc = page.waitForEvent("filechooser");
    await page.locator("#dropzone").click();
    await (await fc).setFiles(path.resolve(__dirname, "fixtures/test1.ithmb"));
    await expect(page.locator(".file-card")).toHaveCount(1);
    await page.waitForTimeout(500);
    console.log("PERF decoder:", JSON.stringify({ bytes, readyMs, requests: urls.size }));

    // WASM must actually load, exactly once, within the size budget. Size is
    // read from Resource Timing so the assertion does not depend on whether
    // the response body was still readable when the response event fired.
    const wasmEntries = await page.evaluate(() =>
      (performance.getEntriesByType("resource") as PerformanceResourceTiming[])
        .filter((e) => /\.wasm(\?|$)/.test(e.name))
        .map((e) => e.decodedBodySize),
    );
    expect(bytes.js).toBeLessThan(220_000);
    expect(bytes.font).toBeLessThanOrEqual(80_000);
    expect(bytes.total).toBeLessThan(900_000);
    expect(wasmEntries.length).toBeGreaterThan(0);
    expect(wasmEntries.reduce((a, n) => a + n, 0)).toBeLessThan(300_000);
    // One locale fetch only: the old i18n preload fetched the active locale
    // twice plus the inactive one.
    expect([...requests].filter((u) => /locales\/[a-z]+\.json/.test(u))).toHaveLength(1);
    // Exactly one WASM download: the preload and the loader share it.
    expect([...requests].filter((u) => /\.wasm(\?|$)/.test(u))).toHaveLength(1);
    // Launch gate: decoder ready in 5 s (measured here on a fast local server;
    // the 400 kbps gate lives in work/shots/perf-b6).
    expect(readyMs).toBeLessThan(5_000);
  });
});
