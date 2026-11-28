// Targeted contrast regression (CH-15).
//
// The axe gate now runs with `color-contrast` enabled, but this spec pins the
// exact element that used to slip through the exclusion: the guide progress
// rail step number, white on the system-blue badge (3.64:1 before the fix).
// A broad axe run can be narrowed by future filters; this one fails if the
// badge fill goes back to a low-contrast blue in either theme.
import { expect, test } from "@playwright/test";

type Ratio = { text: string; color: string; background: string; ratio: number };

const railNumberRatios = (page: import("@playwright/test").Page) =>
  page.evaluate((): Ratio[] => {
    const parse = (value: string): number[] =>
      (value.match(/[\d.]+/g) ?? []).map(Number).slice(0, 3);
    // WCAG relative luminance of an sRGB triplet.
    const lum = (triplet: number[]): number => {
      const lin = (channel: number): number => {
        const v = channel / 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return (
        0.2126 * lin(triplet[0] ?? 0) +
        0.7152 * lin(triplet[1] ?? 0) +
        0.0722 * lin(triplet[2] ?? 0)
      );
    };
    // Effective background: composite translucent fills over the nearest
    // opaque ancestor (badges are solid, but the compositing keeps this honest
    // if the badge ever gets a tint).
    const background = (el: Element): number[] => {
      let current: Element | null = el;
      let out: number[] = [255, 255, 255];
      const layers: number[][] = [];
      while (current) {
        const parts = (getComputedStyle(current).backgroundColor.match(/[\d.]+/g) ?? []).map(
          Number,
        );
        const alpha = parts[3] ?? 1;
        if (parts.length >= 4 && alpha > 0) {
          layers.push(parts);
          if (alpha >= 0.999) break;
        } else if (parts.length >= 3) {
          layers.push([parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, 1]);
          break;
        }
        current = current.parentElement;
      }
      for (const layer of layers.reverse()) {
        const alpha = layer[3] ?? 1;
        out = [0, 1, 2].map((i) => (layer[i] ?? 0) * alpha + (out[i] ?? 0) * (1 - alpha));
      }
      return out;
    };
    return [...document.querySelectorAll(".guide-rail__num")].map((el) => {
      const fg = parse(getComputedStyle(el).color);
      const bg = background(el);
      const l1 = lum(fg);
      const l2 = lum(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      return {
        text: (el.textContent ?? "").trim(),
        color: getComputedStyle(el).color,
        background: `rgb(${bg.map((n) => Math.round(n)).join(", ")})`,
        ratio: Math.round(ratio * 100) / 100,
      };
    });
  });

for (const theme of ["light", "dark"] as const) {
  test(`guide progress rail numbers meet WCAG AA contrast (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.goto("/guide/how-to-open-ithmb-files.html");
    // Scroll once so the spy marks the earlier steps as done (the done badge
    // uses the same accent fill as the active one).
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
    await expect
      .poll(() =>
        page.evaluate(() => document.querySelectorAll(".guide-rail__step.is-done").length),
      )
      .toBeGreaterThan(0);

    const ratios = await railNumberRatios(page);
    expect(ratios.length).toBeGreaterThan(0);
    for (const badge of ratios) {
      const where = `step ${badge.text} (${badge.color} on ${badge.background})`;
      expect(badge.ratio, `${theme} ${where} contrast`).toBeGreaterThanOrEqual(4.5);
    }

    // Active and done badges are both covered: they are the two filled states.
    const states = await page.evaluate(() => ({
      active: document.querySelectorAll(".guide-rail__step.is-active .guide-rail__num").length,
      done: document.querySelectorAll(".guide-rail__step.is-done .guide-rail__num").length,
    }));
    expect(states.active + states.done).toBeGreaterThan(0);
  });
}
