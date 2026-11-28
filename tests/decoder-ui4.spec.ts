// Decoder UX pass 4: light viewer band, ambient mode, full-rail filmstrip
// centring, persistent viewer + scrollable grid, batch cap and edge cases.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { waitDecodeSettled } from "./helpers";

const FIXTURES = path.join(__dirname, "fixtures");

async function loadFiles(page: Page, names: string[]): Promise<void> {
  await page.setInputFiles(
    "#fileInput",
    names.map((n) => path.join(FIXTURES, n)),
  );
  await waitDecodeSettled(page, names.length);
}

const filmstripState = () =>
  (() => {
    const rail = document.getElementById("viewer-filmstrip")!;
    const track = document.getElementById("filmstripTrack")!;
    const thumbs = [...document.querySelectorAll(".filmstrip-thumb")];
    const rect = rail.getBoundingClientRect();
    const first = thumbs[0]?.getBoundingClientRect();
    const last = thumbs[thumbs.length - 1]?.getBoundingClientRect();
    const groupCenter = first && last ? (first.left + last.right) / 2 : null;
    const count = document.getElementById("viewerPos")!.getBoundingClientRect();
    return {
      count: thumbs.length,
      railCenter: Math.round(rect.left + rect.width / 2),
      groupCenter: groupCenter === null ? null : Math.round(groupCenter),
      centerOffset:
        groupCenter === null ? null : Math.round(groupCenter - (rect.left + rect.width / 2)),
      hasOverflow: track.classList.contains("has-overflow"),
      firstLeftGap: first ? Math.round(first.left - rect.left) : null,
      lastRightGap: last ? Math.round(rect.right - last.right) : null,
      countRightGap: Math.round(rect.right - count.right),
      countColor: getComputedStyle(document.getElementById("viewerPos")!).color,
    };
  })();

test.describe("Decoder UX pass 4", () => {
  test("light mode viewer band is light, dark stays dark, controls re-tuned", async ({ page }) => {
    await page.goto("/ithmb-decoder/", { waitUntil: "networkidle" });
    await loadFiles(page, ["uyvy.ithmb"]);
    const light = await page.evaluate(() => {
      const band = document.getElementById("viewer-container")!;
      const meta = document.querySelector(".big-stage__meta")!;
      const arrow = document.querySelector(".big-stage__arrow")!;
      const count = document.getElementById("viewerPos")!;
      const c = getComputedStyle(band);
      return {
        bg: c.backgroundColor,
        text: c.color,
        metaBg: getComputedStyle(meta).backgroundColor,
        metaText: getComputedStyle(meta).color,
        arrowText: getComputedStyle(arrow).color,
        countText: getComputedStyle(count).color,
      };
    });
    expect(light.bg).toBe("rgb(242, 242, 245)");
    expect(light.metaText).toBe("rgb(29, 29, 31)");
    expect(light.arrowText).toBe("rgb(29, 29, 31)");
    // Count pill text must be readable on the light pill (not white-on-white).
    expect(light.countText).not.toBe("rgba(255, 255, 255, 0.7)");
    expect(light.countText).not.toBe("rgb(255, 255, 255)");

    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await expect
      .poll(() =>
        page.evaluate(
          () => getComputedStyle(document.getElementById("viewer-container")!).backgroundColor,
        ),
      )
      .toBe("rgb(0, 0, 0)");
    const dark = await page.evaluate(() => {
      const band = document.getElementById("viewer-container")!;
      const meta = document.querySelector(".big-stage__meta")!;
      return {
        bg: getComputedStyle(band).backgroundColor,
        metaText: getComputedStyle(meta).color,
      };
    });
    expect(dark.bg).toBe("rgb(0, 0, 0)");
    expect(dark.metaText).toBe("rgb(245, 245, 247)");
  });

  test("ambient vars change and the rendered band differs from neutral", async ({ page }) => {
    const tmp = path.join(os.tmpdir(), `ambient-colour-${Date.now()}.ithmb`);
    fs.copyFileSync(path.join(FIXTURES, "uyvy.ithmb"), tmp);
    try {
      await page.goto("/ithmb-decoder/", { waitUntil: "networkidle" });
      await page.setInputFiles("#fileInput", [tmp]);
      await page.waitForFunction(
        () => document.getElementById("viewer-container")?.dataset.ambient === "on",
        null,
        { timeout: 15000 },
      );
      const colour = await page.evaluate(() => {
        const band = document.getElementById("viewer-container")!;
        return {
          ambient: band.dataset.ambient,
          vars: ["--ambient-1", "--ambient-2", "--ambient-3"].map((v) =>
            getComputedStyle(band).getPropertyValue(v).trim(),
          ),
          glow: getComputedStyle(band, "::before").backgroundImage,
        };
      });
      expect(colour.ambient).toBe("on");
      const colourInline = await page.evaluate(() => {
        const band = document.getElementById("viewer-container")!;
        return ["--ambient-1", "--ambient-2", "--ambient-3"].map((v) =>
          band.style.getPropertyValue(v).trim(),
        );
      });
      expect(colourInline.every((v) => /^rgb\(/.test(v))).toBe(true);
      expect(colour.glow).not.toBe("none");

      // Neutral fallback with a mostly-black image.
      await page.goto("/ithmb-decoder/", { waitUntil: "networkidle" });
      await loadFiles(page, ["test1.ithmb"]);
      const neutral = await page.evaluate(() => {
        const band = document.getElementById("viewer-container")!;
        return {
          ambient: band.dataset.ambient,
          vars: ["--ambient-1", "--ambient-2", "--ambient-3"].map((v) =>
            getComputedStyle(band).getPropertyValue(v).trim(),
          ),
          glow: getComputedStyle(band, "::before").backgroundImage,
        };
      });
      expect(neutral.ambient).toBe("neutral");
      const neutralInline = await page.evaluate(() => {
        const band = document.getElementById("viewer-container")!;
        return ["--ambient-1", "--ambient-2", "--ambient-3"].map((v) =>
          band.style.getPropertyValue(v).trim(),
        );
      });
      expect(neutralInline).toEqual(["transparent", "transparent", "transparent"]);
      expect(neutral.glow).toBe("none");
      // The rendered band differs from neutral: colourful images produce a
      // real gradient on the band pseudo-element, the neutral fallback has none.
      expect(neutral.glow).toBe("none");
      expect(colour.glow).toContain("radial-gradient");
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  });

  test("filmstrip centres relative to the full rail and scrolls when full", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/ithmb-decoder/", { waitUntil: "networkidle" });
    await loadFiles(page, ["uyvy.ithmb", "test1.ithmb", "test2.ithmb"]);
    // The rail re-measures itself in a rAF after each thumb lands; poll the
    // settled geometry instead of reading it on the first possible frame.
    await expect
      .poll(
        async () => {
          const s = await page.evaluate(filmstripState);
          return s.count === 3 && !s.hasOverflow && Math.abs(s.centerOffset ?? 99) <= 2;
        },
        { timeout: 10000 },
      )
      .toBe(true);
    const centred = await page.evaluate(filmstripState);
    expect(centred.count).toBe(3);
    expect(centred.hasOverflow).toBe(false);
    // Symmetric to the FULL rail width, not the leftover track width.
    expect(Math.abs(centred.centerOffset ?? 99)).toBeLessThanOrEqual(2);
    expect(centred.countRightGap).toBeLessThanOrEqual(24);

    await page.setViewportSize({ width: 390, height: 844 });
    await loadFiles(page, [
      "uyvy.ithmb",
      "test1.ithmb",
      "test2.ithmb",
      "test3.ithmb",
      "test4.ithmb",
      "test5.ithmb",
      "test6.ithmb",
      "test7.ithmb",
    ]);
    // The second batch auto-opens its first card, which smooth-scrolls the rail
    // to that thumb. Centre the FIRST image instead (a real user action) so the
    // overflow geometry is deterministic: first thumb at scrollLeft 0.
    await page.locator(".filmstrip-thumb").first().click();
    await expect
      .poll(
        async () => {
          const s = await page.evaluate(filmstripState);
          return s.hasOverflow && (s.firstLeftGap ?? 99) <= 2 && s.countRightGap <= 20;
        },
        { timeout: 10000 },
      )
      .toBe(true);
    const overflow = await page.evaluate(filmstripState);
    expect(overflow.count).toBeGreaterThanOrEqual(8);
    expect(overflow.hasOverflow).toBe(true);
    expect(overflow.firstLeftGap ?? 99).toBeLessThanOrEqual(20);
    expect(overflow.countRightGap).toBeLessThanOrEqual(20);
    // Light band: count pill text is dark, not white.
    expect(overflow.countColor).not.toContain("255, 255, 255");
  });

  test("grid toggle is gone: viewer + results grid are always visible; G is a no-op", async ({
    page,
  }) => {
    await page.goto("/ithmb-decoder/", { waitUntil: "networkidle" });
    await loadFiles(page, ["uyvy.ithmb", "test1.ithmb"]);
    await expect(page.locator("#viewToggleBtn")).toHaveCount(0);
    await expect(page.locator("#viewer-container")).toBeVisible();
    await expect(page.locator("#file-list .file-card")).toHaveCount(2);
    const before = await page.evaluate(() => ({
      viewer: document.getElementById("viewer-container")!.style.display,
      cards: document.querySelectorAll(".file-card").length,
    }));
    await page.locator("body").click();
    await page.keyboard.press("g");
    const after = await page.evaluate(() => ({
      viewer: document.getElementById("viewer-container")!.style.display,
      cards: document.querySelectorAll(".file-card").length,
    }));
    expect(after).toEqual(before);
    await expect(page.locator("#viewer-container")).toBeVisible();
    await expect(page.locator("#file-list .file-card")).toHaveCount(2);
  });

  test("viewer surface modes are token-driven (theme-matched default)", async ({ page }) => {
    await page.goto("/ithmb-decoder/", { waitUntil: "networkidle" });
    await loadFiles(page, ["uyvy.ithmb"]);
    const bg = () =>
      page.evaluate(
        () => getComputedStyle(document.getElementById("viewer-container")!).backgroundColor,
      );
    await expect.poll(bg).toBe("rgb(242, 242, 245)");
    await page.evaluate(() =>
      document.documentElement.setAttribute("data-viewer-mode", "dark-stage"),
    );
    await expect.poll(bg).toBe("rgb(0, 0, 0)");
    await page.evaluate(() =>
      document.documentElement.setAttribute("data-viewer-mode", "inverted"),
    );
    await expect.poll(bg).toBe("rgb(0, 0, 0)");
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await expect.poll(bg).toBe("rgb(242, 242, 245)");
    await page.evaluate(() => document.documentElement.removeAttribute("data-viewer-mode"));
    await expect.poll(bg).toBe("rgb(0, 0, 0)");
  });

  test("batch cap: 205 files → 200 processed, 5 skipped with one clear message", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/ithmb-decoder/", { waitUntil: "networkidle" });
    const buf = fs.readFileSync(path.join(FIXTURES, "test1.ithmb"));
    const files = Array.from({ length: 205 }, (_, i) => ({
      name: `cap-${i}.ithmb`,
      mimeType: "application/octet-stream",
      buffer: buf,
    }));
    await page.setInputFiles("#fileInput", files);
    await waitDecodeSettled(page, 200);
    await expect(page.locator(".file-card")).toHaveCount(200);
    await expect(page.locator("#batchNotice")).toContainText(/5 over the 200-file session limit/);
    // Grid scrolls inside its own capped region; the page stays bounded.
    const grid = await page.evaluate(() => {
      const g = document.getElementById("file-list")!;
      return {
        clientHeight: g.clientHeight,
        scrollHeight: g.scrollHeight,
        overflowY: getComputedStyle(g).overflowY,
        bodyHeight: document.body.scrollHeight,
      };
    });
    expect(grid.overflowY).toBe("auto");
    expect(grid.scrollHeight).toBeGreaterThan(grid.clientHeight);
    expect(grid.bodyHeight).toBeLessThan(5000);

    // Exactly at the limit: no "too many" message.
    await page.goto("/ithmb-decoder/", { waitUntil: "networkidle" });
    const exact = Array.from({ length: 200 }, (_, i) => ({
      name: `exact-${i}.ithmb`,
      mimeType: "application/octet-stream",
      buffer: buf,
    }));
    await page.setInputFiles("#fileInput", exact);
    await waitDecodeSettled(page, 200);
    await expect(page.locator("#batchNotice")).toBeHidden();
  });

  test("edge cases: uppercase extension, zero-byte file, duplicate dedupe", async ({ page }) => {
    await page.goto("/ithmb-decoder/", { waitUntil: "networkidle" });
    const buf = fs.readFileSync(path.join(FIXTURES, "test1.ithmb"));
    await page.setInputFiles("#fileInput", [
      { name: "UPPER.ITHMB", mimeType: "application/octet-stream", buffer: buf },
      { name: "zero.ithmb", mimeType: "application/octet-stream", buffer: Buffer.alloc(0) },
    ]);
    await waitDecodeSettled(page, 2);
    await expect(page.locator(".file-card")).toHaveCount(2);
    await expect(page.locator(".file-card .status.err").first()).toContainText(
      /Couldn't decode|damaged|Empty/i,
    );
    // Duplicate (same name + same content) is deduplicated in one batch.
    await page.goto("/ithmb-decoder/", { waitUntil: "networkidle" });
    await page.setInputFiles("#fileInput", [
      { name: "dup.ithmb", mimeType: "application/octet-stream", buffer: buf },
      { name: "dup.ithmb", mimeType: "application/octet-stream", buffer: buf },
    ]);
    await waitDecodeSettled(page, 1);
    await expect(page.locator(".file-card")).toHaveCount(1);
  });

  test("200-file batch on mobile: no horizontal overflow, grid scrolls", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/ithmb-decoder/", { waitUntil: "networkidle" });
    const buf = fs.readFileSync(path.join(FIXTURES, "test1.ithmb"));
    const files = Array.from({ length: 200 }, (_, i) => ({
      name: `mobile-${i}.ithmb`,
      mimeType: "application/octet-stream",
      buffer: buf,
    }));
    await page.setInputFiles("#fileInput", files);
    await waitDecodeSettled(page, 200);
    const state = await page.evaluate(() => {
      const g = document.getElementById("file-list")!;
      return {
        cards: document.querySelectorAll(".file-card").length,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        gridScrolls: g.scrollHeight > g.clientHeight,
        bodyHeight: document.body.scrollHeight,
      };
    });
    expect(state.cards).toBe(200);
    expect(state.scrollWidth).toBeLessThanOrEqual(state.innerWidth + 1);
    expect(state.gridScrolls).toBe(true);
    expect(state.bodyHeight).toBeLessThan(6000);
  });
});
