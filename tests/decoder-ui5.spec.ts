// Edge-case fix pass (UI5): memory caps, download gating/BMP, init queue,
// keyboard model, summary, interaction guards.
import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { waitDecodeSettled } from "./helpers";

const FIXTURES = path.join(__dirname, "fixtures");
const small = () => fs.readFileSync(path.join(FIXTURES, "test1.ithmb"));

async function waitSettled(page: Page, cards = 1): Promise<void> {
  await waitDecodeSettled(page, cards);
}

test.describe("Decoder edge fixes (UI5)", () => {
  test("BMP save is a real 24-bit BMP, not PNG bytes", async ({ page }) => {
    await page.goto("/ithmb-decoder/", { waitUntil: "networkidle" });
    await page.setInputFiles("#fileInput", [path.join(FIXTURES, "uyvy.ithmb")]);
    await waitSettled(page);
    await page.locator("#fmtSeg [data-format='image/bmp']").click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("[data-save]").first().click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.bmp$/);
    const file = await download.path();
    const bytes = fs.readFileSync(file!);
    expect(bytes.subarray(0, 2).toString("latin1")).toBe("BM");
    expect(bytes.readUInt32LE(2)).toBe(bytes.length); // file size
    expect(bytes.readUInt32LE(10)).toBe(54); // pixel data offset
    expect(bytes.readUInt16LE(28)).toBe(24); // bpp
    expect(bytes.readUInt32LE(30)).toBe(0); // BI_RGB
    // Rows padded to 4 bytes.
    const width = bytes.readInt32LE(18);
    expect(bytes.length).toBe(54 + Math.ceil((width * 3) / 4) * 4 * bytes.readInt32LE(22));
  });

  test("Download all is gated during decoding and snapshots the format", async ({ page }) => {
    await page.goto("/ithmb-decoder/", { waitUntil: "networkidle" });
    const buf = small();
    const files = Array.from({ length: 200 }, (_, i) => ({
      name: `gate-${i}.ithmb`,
      mimeType: "application/octet-stream",
      buffer: buf,
    }));
    await page.setInputFiles("#fileInput", files);
    const btn = page.locator("#downloadAllBtn");
    await expect(btn).toBeVisible();
    await expect(btn).toBeDisabled();
    await expect(btn).toContainText(/Decoding \d+\/200/);
    await page.waitForFunction(
      () =>
        document.querySelectorAll(".file-card").length >= 200 &&
        document.querySelectorAll(".file-card .status.loading").length === 0,
      null,
      { timeout: 120000 },
    );
    await expect(btn).toBeEnabled({ timeout: 15000 });
    await expect(btn).toHaveText("Download all (.zip)");
    // Format controls are locked while building only; the archive name follows
    // the current (snapshotted) format.
    await page.locator("#fmtSeg [data-format='image/png']").click();
    const [download] = await Promise.all([page.waitForEvent("download"), btn.click()]);
    expect(download.suggestedFilename()).toContain("png");
    await expect(page.locator("#fmtSeg [data-format='image/png']")).toBeEnabled();
  });

  test("init gate queues early files instead of failing them", async ({ page }) => {
    // Slow the WASM fetch so the file input fires before init resolves.
    await page.route("**/*.wasm*", async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await page.goto("/ithmb-decoder/", { waitUntil: "domcontentloaded" });
    await page.setInputFiles("#fileInput", [path.join(FIXTURES, "uyvy.ithmb")]);
    // Fast/short init must not flash a loading label any more.
    await expect(page.locator("#decoding")).toBeHidden();
    await waitSettled(page);
    await expect(page.locator(".file-card")).toHaveCount(1);
    await expect(page.locator(".file-card .status.err")).toHaveCount(0);
    await expect(page.locator(".file-card .status")).not.toContainText(/error/i);
    await expect(page.locator("#decoding")).toBeHidden();
  });

  test("session cap is 200 files across Add-file batches, with a persistent summary", async ({
    page,
  }) => {
    await page.goto("/ithmb-decoder/", { waitUntil: "networkidle" });
    const buf = small();
    const make = (prefix: string, n: number) =>
      Array.from({ length: n }, (_, i) => ({
        name: `${prefix}-${i}.ithmb`,
        mimeType: "application/octet-stream",
        buffer: buf,
      }));
    await page.setInputFiles("#fileInput", make("first", 200));
    await waitSettled(page, 200);
    await expect(page.locator(".file-card")).toHaveCount(200);
    await page.setInputFiles("#fileInput", make("second", 10));
    await expect(page.locator(".file-card")).toHaveCount(200);
    const notice = page.locator("#batchNotice");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(/10 over the 200-file session limit/);
    // Filmstrip DOM is capped while the counter still knows all images.
    expect(await page.locator(".filmstrip-thumb").count()).toBeLessThanOrEqual(50);
    await page.locator("[data-dismiss-batch]").click();
    await expect(notice).toBeHidden();
  });

  test("mixed batch shows one aggregated summary counting duplicates", async ({ page }) => {
    await page.goto("/ithmb-decoder/", { waitUntil: "networkidle" });
    const buf = small();
    await page.setInputFiles("#fileInput", [
      { name: "ok.ithmb", mimeType: "application/octet-stream", buffer: buf },
      { name: "ok.ithmb", mimeType: "application/octet-stream", buffer: buf },
      { name: "no.txt", mimeType: "text/plain", buffer: Buffer.from("x") },
      { name: "UPPER.ITHMB", mimeType: "application/octet-stream", buffer: buf },
    ]);
    await waitSettled(page);
    const summary = page.locator("#batchNotice");
    await expect(summary).toBeVisible();
    await expect(summary).toContainText(/1 duplicate/);
    await expect(summary).toContainText(/1 not \.ithmb/);
    await expect(summary).toContainText(/accepted/);
    await expect(page.locator(".file-card")).toHaveCount(2);
  });

  test("keyboard: skip to results, one grid tab stop, arrows move cards, Enter opens viewer", async ({
    page,
  }) => {
    await page.goto("/ithmb-decoder/", { waitUntil: "networkidle" });
    await page.setInputFiles("#fileInput", [
      path.join(FIXTURES, "uyvy.ithmb"),
      path.join(FIXTURES, "test1.ithmb"),
      path.join(FIXTURES, "test2.ithmb"),
    ]);
    await waitSettled(page, 3);
    // Skip link jumps focus to the results region.
    await page.locator(".skip-link--results").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#file-list")).toBeFocused();
    // Roving tabindex: exactly one card is tabbable.
    const tabbable = await page.locator('.file-card[tabindex="0"]').count();
    expect(tabbable).toBe(1);
    // Arrows move within the grid, not the viewer.
    const posBefore = await page.locator("#viewerPos").textContent();
    await page.locator('.file-card[tabindex="0"]').focus();
    await page.keyboard.press("ArrowRight");
    const focusedName = await page.evaluate(
      () => (document.activeElement as HTMLElement)?.querySelector(".name")?.textContent ?? "",
    );
    expect(focusedName).toContain("test1");
    await expect(page.locator("#viewerPos")).toHaveText(posBefore!);
    // Enter opens that card in the viewer.
    await page.keyboard.press("Enter");
    await expect(page.locator("#viewerPos")).toContainText(/2 \/ 3/);
  });

  test("clicking a card scrolled off-screen brings the viewer into view with a toast", async ({
    page,
  }) => {
    await page.goto("/ithmb-decoder/", { waitUntil: "networkidle" });
    const buf = small();
    await page.setInputFiles(
      "#fileInput",
      Array.from({ length: 30 }, (_, i) => ({
        name: `offscreen-${i}.ithmb`,
        mimeType: "application/octet-stream",
        buffer: buf,
      })),
    );
    await waitSettled(page, 30);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.locator(".file-card").nth(20).click();
    await expect(page.locator(".toast")).toContainText(/Showing 21 of 30/);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const r = document.getElementById("viewer-container")!.getBoundingClientRect();
          return r.top < window.innerHeight && r.bottom > 0;
        }),
      )
      .toBe(true);
  });

  test("database containers route to the desktop-tool failure card", async ({ page }) => {
    await page.goto("/ithmb-decoder/", { waitUntil: "networkidle" });
    const mhfd = Buffer.alloc(4096);
    mhfd.write("mhfd", 0, "latin1");
    await page.setInputFiles("#fileInput", [
      { name: "ArtworkDB.ithmb", mimeType: "application/octet-stream", buffer: mhfd },
    ]);
    await waitSettled(page);
    await expect(page.locator(".file-card .status")).toContainText(/database/i);
    await expect(page.locator("#viewer-stage .failure-info__title")).toContainText(/database/i);
    await expect(page.locator("#viewer-stage .failure-info__why")).toContainText(/desktop/i);
  });

  test("decoder page exposes the external watchdog and noscript fallbacks", async ({ page }) => {
    await page.goto("/ithmb-decoder/", { waitUntil: "networkidle" });
    // The watchdog is an external classic script (CSP: no inline script); its
    // failure panel is created lazily, so no panel exists on a healthy load.
    await expect(page.locator('script[src*="decoder-watchdog.js"]')).toBeAttached();
    await expect(page.locator("#loadFailed")).toHaveCount(0);
    expect(await page.locator("noscript").count()).toBeGreaterThanOrEqual(1);
    const accept = await page.locator("#fileInput").getAttribute("accept");
    expect(accept).toContain(".ITHMB");
    expect(accept).toContain(".IPM");
  });
});
