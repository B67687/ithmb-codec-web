// Decoder UI/UX pass 3: display line breaks, filmstrip centering, lifted band,
// ambient viewer light. Behavioural guarantees that the CSS alone can't cover.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { waitDecodeSettled, waitForScrollEnd } from "./helpers";

const FIXTURES = path.join(__dirname, "fixtures");

async function loadFiles(page: Page, names: string[]): Promise<void> {
  await page.setInputFiles(
    "#fileInput",
    names.map((n) => path.join(FIXTURES, n)),
  );
  await waitDecodeSettled(page, names.length);
}

const filmstrip = () =>
  (() => {
    const track = document.getElementById("filmstripTrack")!;
    const thumbs = [...document.querySelectorAll(".filmstrip-thumb")];
    const tr = track.getBoundingClientRect();
    const first = thumbs[0]?.getBoundingClientRect();
    const last = thumbs[thumbs.length - 1]?.getBoundingClientRect();
    return {
      count: thumbs.length,
      hasOverflow: track.classList.contains("has-overflow"),
      justify: getComputedStyle(track).justifyContent,
      leftGap: first ? Math.round(first.left - tr.left) : 0,
      rightGap: last ? Math.round(tr.right - last.right) : 0,
      scrolls: track.scrollWidth > track.clientWidth + 1,
      countText: document.getElementById("viewerPos")?.textContent,
    };
  })();

test.describe("Decoder UI pass 3", () => {
  test("display line breaks are deliberate at desktop, hidden on phones", async ({ page }) => {
    for (const [w, visible] of [
      [1440, true],
      [1024, true],
      [390, false],
      [320, false],
    ] as const) {
      await page.setViewportSize({ width: w, height: 800 });
      await page.goto("/", { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      const home = await page.evaluate(() => {
        const br = document.querySelector(".subtitle .display-break");
        const note = document.querySelector(".home-hero__note .display-break");
        return {
          present: !!br && !!note,
          visible: !!br && getComputedStyle(br).display !== "none",
          subtitleLines: Math.round(
            document.querySelector(".subtitle")!.getBoundingClientRect().height /
              parseFloat(getComputedStyle(document.querySelector(".subtitle")!).lineHeight),
          ),
        };
      });
      expect(home.present, `home ${w}: breaks present`).toBe(true);
      expect(home.visible, `home ${w}: break visibility`).toBe(visible);
      expect(home.subtitleLines, `home ${w}: subtitle line count`).toBeLessThanOrEqual(
        w >= 390 ? 3 : 5,
      );
    }
  });

  test("filmstrip centres thumbs, left-aligns and scrolls on overflow", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/ithmb-decoder/", { waitUntil: "networkidle" });
    await loadFiles(page, ["uyvy.ithmb", "test1.ithmb", "test2.ithmb"]);
    // The rail re-measures itself in a rAF after each thumb lands; poll the
    // settled geometry instead of reading it on the first possible frame.
    await expect
      .poll(
        async () => {
          const s = await page.evaluate(filmstrip);
          return (
            s.count === 3 &&
            !s.hasOverflow &&
            s.justify === "center" &&
            Math.abs(s.leftGap - s.rightGap) <= 2
          );
        },
        { timeout: 10000 },
      )
      .toBe(true);
    const centred = await page.evaluate(filmstrip);
    expect(centred.count).toBe(3);
    expect(centred.hasOverflow).toBe(false);
    expect(centred.justify).toBe("center");
    expect(Math.abs(centred.leftGap - centred.rightGap)).toBeLessThanOrEqual(2);
    expect(centred.countText).toBe("1 / 3");

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
          const s = await page.evaluate(filmstrip);
          return (
            s.hasOverflow && s.justify === "flex-start" && s.scrolls && Math.abs(s.leftGap) <= 2
          );
        },
        { timeout: 10000 },
      )
      .toBe(true);
    const overflowing = await page.evaluate(filmstrip);
    expect(overflowing.count).toBeGreaterThanOrEqual(8);
    expect(overflowing.hasOverflow).toBe(true);
    expect(overflowing.scrolls).toBe(true);
    expect(overflowing.justify).toBe("flex-start");
    expect(overflowing.leftGap).toBeLessThanOrEqual(2);
    // Count pill stays pinned and readable.
    const pill = await page.evaluate(() => {
      const c = document.getElementById("viewerPos")!.getBoundingClientRect();
      const s = document.getElementById("viewer-filmstrip")!.getBoundingClientRect();
      return {
        text: document.getElementById("viewerPos")!.textContent,
        rightGap: Math.round(s.right - c.right),
      };
    });
    expect(pill.text).toMatch(/\d+ \/ 8/);
    expect(pill.rightGap).toBeLessThanOrEqual(20);
  });

  test("light-mode band is light, dark stays black", async ({ page }) => {
    await page.goto("/ithmb-decoder/", { waitUntil: "networkidle" });
    await loadFiles(page, ["uyvy.ithmb"]);
    const light = await page.evaluate(
      () => getComputedStyle(document.getElementById("viewer-container")!).backgroundColor,
    );
    expect(light).toBe("rgb(242, 242, 245)");
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await expect
      .poll(() =>
        page.evaluate(
          () => getComputedStyle(document.getElementById("viewer-container")!).backgroundColor,
        ),
      )
      .toBe("rgb(0, 0, 0)");
  });

  test("ambient light samples once per image change, never on scroll/resize", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/ithmb-decoder/", { waitUntil: "networkidle" });
    const tmp = [1, 2, 3].map((i) =>
      path.join(os.tmpdir(), "ambient-" + i + "-" + Date.now() + ".ithmb"),
    );
    for (const f of tmp) fs.copyFileSync(path.join(FIXTURES, "uyvy.ithmb"), f);
    await page.setInputFiles("#fileInput", tmp);
    await page.waitForFunction(
      (n) =>
        document.querySelectorAll(".filmstrip-thumb").length >= n &&
        document.querySelectorAll(".file-card .preview canvas").length >= n,
      3,
      { timeout: 30000 },
    );
    // Open the viewer explicitly (some browsers decode after the auto-open):
    // ambient sampling must run on the decoded stage image.
    await page.locator(".filmstrip-thumb").first().click();
    // Decode/sampling timing differs across engines: wait for the sampled
    // state instead of a fixed timeout.
    await page.waitForFunction(
      () => document.getElementById("viewer-container")?.dataset.ambient === "on",
      null,
      { timeout: 15000 },
    );
    for (const f of tmp) fs.rmSync(f, { force: true });
    const state = () =>
      page.evaluate(() => {
        const c = document.getElementById("viewer-container")!;
        return {
          ambient: c.dataset.ambient,
          samples: Number(c.dataset.ambientSamples ?? 0),
          sampleMs: Number(c.dataset.ambientMs ?? 0),
          vars: ["--ambient-1", "--ambient-2", "--ambient-3"].map((v) =>
            getComputedStyle(c).getPropertyValue(v).trim(),
          ),
          glow: getComputedStyle(c, "::before").backgroundImage,
        };
      });
    const first = await state();
    expect(first.ambient).toBe("on");
    expect(
      first.vars.every((v) => v !== "" && v !== "transparent" && v !== "rgba(0, 0, 0, 0)"),
    ).toBe(true);
    expect(first.glow).not.toBe("none");
    // Sampling cost is a one-off small canvas read.
    expect(first.sampleMs).toBeLessThan(80);
    // Scroll + resize must NOT resample. Wait two frames so any scroll/resize
    // listener that (wrongly) resamples has had its chance.
    await page.mouse.wheel(0, 150);
    await page.setViewportSize({ width: 1400, height: 880 });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    expect((await state()).samples).toBe(first.samples);
    // Image change MUST resample (arrow to next image).
    await page.locator("#nextBtn").click();
    await expect.poll(async () => (await state()).samples).toBe(first.samples + 1);
    const second = await state();
    expect(second.ambient).toBe("on");
    // Geometry stays fixed while the glow changes. Compare document coordinates
    // (not viewport ones) and let any smooth scroll caused by the click settle
    // first: the viewer band is below the fold at this viewport.
    const boxes = () =>
      page.evaluate((): string[] => {
        const r = (s: string): string => {
          const b = document.querySelector(s)!.getBoundingClientRect();
          return JSON.stringify({
            x: Math.round(b.x + window.scrollX),
            y: Math.round(b.y + window.scrollY),
            width: Math.round(b.width),
            height: Math.round(b.height),
          });
        };
        return [
          r("#viewer-main"),
          r("#viewer-stage canvas"),
          r("#viewer-filmstrip"),
          r("#prevBtn"),
          r("#nextBtn"),
        ];
      });
    await page.locator("#nextBtn").scrollIntoViewIfNeeded();
    await waitForScrollEnd(page);
    const before = await boxes();
    await page.locator("#nextBtn").click();
    await expect.poll(async () => (await state()).samples).toBe(second.samples + 1);
    await waitForScrollEnd(page);
    const after = await boxes();
    expect(after).toEqual(before);
    expect(errors).toEqual([]);
  });

  test("near-black images use the neutral fallback, failed decodes too", async ({ page }) => {
    await page.goto("/ithmb-decoder/", { waitUntil: "networkidle" });
    await loadFiles(page, ["test1.ithmb"]);
    const black = await page.evaluate(() => {
      const c = document.getElementById("viewer-container")!;
      return {
        ambient: c.dataset.ambient,
        vars: getComputedStyle(c).getPropertyValue("--ambient-1").trim(),
      };
    });
    expect(black.ambient).toBe("neutral");
    expect(black.vars).toBe("rgba(0, 0, 0, 0)");
    await page.goto("/ithmb-decoder/", { waitUntil: "networkidle" });
    await loadFiles(page, ["garbage.ithmb"]);
    const failed = await page.evaluate(
      () => document.getElementById("viewer-container")!.dataset.ambient,
    );
    expect(failed).toBe("neutral");
  });

  test("ambient makes no network requests and stores nothing", async ({ page, context }) => {
    const external: string[] = [];
    page.on("request", (r) => {
      const u = new URL(r.url());
      if (u.hostname !== "127.0.0.1" && u.hostname !== "localhost") external.push(r.url());
    });
    await page.goto("/ithmb-decoder/", { waitUntil: "networkidle" });
    await loadFiles(page, ["uyvy.ithmb", "test1.ithmb"]);
    await page.locator("#nextBtn").click();
    await expect
      .poll(() => page.evaluate(() => document.body.dataset.viewerState ?? null))
      .toBe("image");
    expect(external).toEqual([]);
    const storage = await page.evaluate(() => ({ ...localStorage }));
    for (const key of Object.keys(storage)) {
      expect(/ambient/i.test(key), `storage key ${key}`).toBe(false);
    }
    await context.clearCookies();
  });
});
