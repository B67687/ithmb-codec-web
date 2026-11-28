// Regression tests for the machine-readable state hooks (CH-14).
//
// The decoder used to expose only `window.IthmbDecoderReady`, so every decoder
// test had to sleep after a drop and hope the last decode had painted. These
// hooks make the pipeline observable:
//   html[data-decoder-state]  booting | ready | failed
//   body[data-decode-phase]   idle | decoding | settled
//   body[data-decoded-count] / [data-file-count] / [data-pending-decodes]
//   body[data-viewer-state]   closed | loading | image | failed
import path from "node:path";
import { expect, test } from "@playwright/test";
import { decodedCount, waitDecodeSettled, waitDecoderState, waitViewerState } from "./helpers";

const FIX = path.join(__dirname, "fixtures");

// Record every value of a body data attribute, so a transient state can be
// asserted without racing it.
async function recordAttribute(page: import("@playwright/test").Page, attr: string): Promise<void> {
  await page.evaluate((name) => {
    const store: string[] = [];
    (window as unknown as { __attrLog?: string[] }).__attrLog = store;
    store.push(document.body.getAttribute(name) ?? "");
    new MutationObserver(() => store.push(document.body.getAttribute(name) ?? "")).observe(
      document.body,
      { attributes: true, attributeFilter: [name] },
    );
  }, attr);
}
const attributeLog = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as unknown as { __attrLog?: string[] }).__attrLog ?? []);

test.describe("Decoder state hooks", () => {
  test("publishes booting before ready and ready after init", async ({ page }) => {
    await page.route("**/*.wasm*", async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await page.goto("/ithmb-decoder/", { waitUntil: "domcontentloaded" });
    const htmlState = () =>
      page.evaluate(() => document.documentElement.dataset.decoderState ?? null);
    await expect.poll(htmlState, { timeout: 5000 }).toBe("booting");
    await expect.poll(htmlState, { timeout: 40000 }).toBe("ready");
    // The legacy ready flag still agrees.
    expect(
      await page.evaluate(
        () => (window as unknown as { IthmbDecoderReady?: boolean }).IthmbDecoderReady === true,
      ),
    ).toBe(true);
  });

  test("publishes failed when the decoder cannot initialise", async ({ page }) => {
    await page.route("**/*.wasm*", (route) => route.abort());
    await page.goto("/ithmb-decoder/", { waitUntil: "domcontentloaded" });
    await waitDecoderState(page, "failed");
    await expect(page.locator("#loadFailed")).toBeVisible();
  });

  test("decode pipeline goes idle -> decoding -> settled with truthful counts", async ({
    page,
  }) => {
    await page.goto("/ithmb-decoder/");
    await waitDecoderState(page, "ready");
    expect(await page.evaluate(() => document.body.dataset.decodePhase)).toBe("idle");
    expect(await page.evaluate(() => document.body.dataset.viewerState)).toBe("closed");

    await recordAttribute(page, "data-decode-phase");
    await page.setInputFiles("#fileInput", [
      path.join(FIX, "test1.ithmb"),
      path.join(FIX, "test2.ithmb"),
      path.join(FIX, "test3.ithmb"),
    ]);
    await waitDecodeSettled(page, 3);

    const phases = await attributeLog(page);
    expect(phases).toContain("decoding");
    expect(phases.at(-1)).toBe("settled");
    expect(await decodedCount(page)).toBe(3);
    expect(await page.evaluate(() => document.body.dataset.fileCount)).toBe("3");
    expect(await page.evaluate(() => document.body.dataset.pendingDecodes)).toBe("0");
    await waitViewerState(page, "image");
  });

  test("viewer state moves loading -> image and reports the active index", async ({ page }) => {
    await page.goto("/ithmb-decoder/");
    await waitDecoderState(page, "ready");
    await page.evaluate(() => {
      const store: string[] = [];
      (window as unknown as { __viewerLog?: string[] }).__viewerLog = store;
      const push = () => store.push(document.body.dataset.viewerState ?? "");
      push();
      new MutationObserver(push).observe(document.body, {
        attributes: true,
        attributeFilter: ["data-viewer-state"],
      });
    });
    await page.setInputFiles("#fileInput", path.join(FIX, "uyvy.ithmb"));
    await waitViewerState(page, "image");
    await waitDecodeSettled(page, 1);
    const log = await page.evaluate(
      () => (window as unknown as { __viewerLog?: string[] }).__viewerLog ?? [],
    );
    expect(log).toContain("loading");
    expect(log.at(-1)).toBe("image");
    expect(await page.evaluate(() => document.body.dataset.viewerIndex)).toBe("0");
  });

  test("failed decode reports the viewer failure state", async ({ page }) => {
    await page.goto("/ithmb-decoder/");
    await waitDecoderState(page, "ready");
    await page.setInputFiles("#fileInput", path.join(FIX, "garbage.ithmb"));
    await waitDecodeSettled(page, 1);
    await waitViewerState(page, "failed");
    expect(await decodedCount(page)).toBe(0);
  });
});

test.describe("Heading and live-region structure", () => {
  for (const [label, url] of [
    ["EN", "/ithmb-decoder/"],
    ["ZH", "/zh/ithmb-decoder/"],
  ] as const) {
    test(`${label} decoder has exactly one h1 before and after a decode`, async ({ page }) => {
      await page.goto(url);
      await waitDecoderState(page, "ready");
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveText(/Free \.ithmb viewer|免费 \.ithmb 看图工具/);
      await page.setInputFiles("#fileInput", path.join(FIX, "test1.ithmb"));
      await waitDecodeSettled(page, 1);
      await expect(page.locator("h1")).toHaveCount(1);
    });
  }

  test("there is one persistent polite announcer, not one per component", async ({ page }) => {
    await page.goto("/ithmb-decoder/");
    await waitDecoderState(page, "ready");
    await page.setInputFiles("#fileInput", path.join(FIX, "test1.ithmb"));
    await waitDecodeSettled(page, 1);

    const live = page.locator("#liveStatus");
    await expect(live).toHaveCount(1);
    await expect(live).toHaveAttribute("role", "status");
    await expect(live).toHaveAttribute("aria-live", "polite");
    // The batch summary is visible text only; #liveStatus announces it.
    await expect(
      page.locator(".batch-notice__text[role], .batch-notice__text[aria-live]"),
    ).toHaveCount(0);
    // The viewer position announcement shares #liveStatus instead of creating
    // a second live region on every toolbar update.
    await expect(page.locator("#viewerLive")).toHaveCount(0);
  });
});
