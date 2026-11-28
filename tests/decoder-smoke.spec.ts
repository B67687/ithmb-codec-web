// Build regression guard: after the content-hashing build step, the decoder
// must still instantiate WASM and decode a real fixture end-to-end. This is the
// smoke test that catches hashing the wasm-pack glue import namespace.
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const FIXTURES = path.join(__dirname, "fixtures");

test.describe("Decoder build smoke test", () => {
  test("uploads a real fixture and decodes it after the build", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => consoleErrors.push(e.message));

    await page.goto("/ithmb-decoder/", { waitUntil: "domcontentloaded" });
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 15000 }),
      page.locator("#dropzone").click(),
    ]);
    await chooser.setFiles([path.join(FIXTURES, "uyvy.ithmb")]);

    const status = page.locator(".file-card .status").first();
    await expect(status).toContainText(/decoded|解码成功/i, { timeout: 20000 });
    await expect(status).not.toContainText(/failed|失败/i);

    const canvas = page.locator(".file-card .preview canvas").first();
    await expect(canvas).toBeVisible();
    const hasPixels = await canvas.evaluate((c) => {
      const el = c as HTMLCanvasElement;
      if (!el.width || !el.height) return false;
      const data = el
        .getContext("2d")
        ?.getImageData(0, 0, Math.min(16, el.width), Math.min(16, el.height)).data;
      return !!data && data.some((v, i) => i % 4 !== 3 && v !== 0);
    });
    expect(hasPixels, "decoded canvas contains image data").toBe(true);

    // The viewer stage must show the decoded image, not the failure card.
    await expect(page.locator("#viewer-stage canvas")).toHaveCount(1);
    expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
  });

  test("wasm-pack glue import namespace stays unhashed in the built output", () => {
    const glue = fs.readFileSync(path.join(__dirname, "..", "ithmb-decoder/ithmb_wasm.js"), "utf8");
    expect(glue).toContain('from "./ithmb_wasm_bg.js"');
    expect(glue).toContain('"./ithmb_wasm_bg.js":');
    expect(glue).not.toContain("ithmb_wasm_bg.js?v=");
  });
});
