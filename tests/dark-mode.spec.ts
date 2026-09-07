import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// Dark-mode regression gate.
//
// The site supports dark mode via @media (prefers-color-scheme: dark) on the
// CSS variables. The whole surface is driven by those variables, so a dark
// regression shows up as: (a) an element still carrying a LIGHT background
// (a hardcoded light color that never got a dark variant), or (b) text whose
// contrast against its own background collapses below 2.2.
//
// This spec runs the exact objective audit a human reviewer would do, on every
// page + the decoder's real file states, in real dark mode (emulated media).
// Any light-background or low-contrast element fails the page.

const PAGES: { name: string; url: string }[] = [
  { name: "home", url: "/" },
  { name: "decoder (empty)", url: "/ithmb-decoder/" },
  { name: "guide", url: "/guide/how-to-open-ithmb-files.html" },
  { name: "privacy", url: "/privacy/" },
  { name: "enterprise", url: "/enterprise/" },
  { name: "zh home", url: "/zh/" },
];

async function auditDark(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const lum = (c: string): number => {
      const m = c.match(/[\d.]+/g);
      if (!m || m.length < 3) return 0;
      const [r = 0, g = 0, b = 0] = m.map(Number);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    // Effective background: composite translucent tints over the nearest
    // solid ancestor (a rgba tint sits on the card/surface, not on air).
    const effectiveBg = (el: Element): string => {
      let cur: HTMLElement | null = el as HTMLElement;
      let r = 0,
        g = 0,
        b = 0,
        hasBg = false;
      while (cur) {
        const m = getComputedStyle(cur).backgroundColor.match(/[\d.]+/g);
        if (m && m.length >= 4 && Number.parseFloat(m[3] ?? "0") > 0) {
          const br = Number.parseFloat(m[0] ?? "0"),
            bg2 = Number.parseFloat(m[1] ?? "0"),
            bb = Number.parseFloat(m[2] ?? "0"),
            ba = Number.parseFloat(m[3] ?? "0");
          r = br * ba + r * (1 - ba);
          g = bg2 * ba + g * (1 - ba);
          b = bb * ba + b * (1 - ba);
          hasBg = true;
        } else if (m && m.length >= 3) {
          r = Number.parseFloat(m[0] ?? "0");
          g = Number.parseFloat(m[1] ?? "0");
          b = Number.parseFloat(m[2] ?? "0");
          hasBg = true;
          break;
        }
        if (cur === document.body || cur.parentElement === null) break;
        cur = cur.parentElement;
      }
      return hasBg ? `rgb(${r}, ${g}, ${b})` : "rgba(0, 0, 0, 0)";
    };
    const issues: string[] = [];
    for (const el of document.querySelectorAll("*")) {
      if (["IMG", "CANVAS", "VIDEO", "SVG", "CODE"].includes(el.tagName)) continue;
      const rawBg = getComputedStyle(el).backgroundColor;
      if (rawBg === "rgba(0, 0, 0, 0)" || rawBg === "transparent") continue;
      const bgl = lum(effectiveBg(el));
      if (bgl > 200) {
        issues.push(
          `LIGHT-BG (${bgl.toFixed(0)}) <${el.tagName} class="${el.className}"> ${(el.textContent ?? "").trim().slice(0, 36)}`,
        );
      }
      // WCAG exempts disabled controls from the contrast requirement.
      const ctrl = el as
        | HTMLButtonElement
        | HTMLInputElement
        | HTMLSelectElement
        | HTMLTextAreaElement;
      if (
        el instanceof HTMLElement &&
        (ctrl.disabled || el.getAttribute("aria-disabled") === "true")
      )
        continue;
      const color = getComputedStyle(el).color;
      if (color !== "rgba(0, 0, 0, 0)" && bgl > 0) {
        const tl = lum(color);
        const contrast = (Math.max(tl, bgl) + 0.05) / (Math.min(tl, bgl) + 0.05);
        if (contrast < 2.2) {
          issues.push(
            `LOW-CONTRAST (${contrast.toFixed(2)}) <${el.tagName} class="${el.className}"> ${(el.textContent ?? "").trim().slice(0, 36)}`,
          );
        }
      }
    }
    return issues;
  });
}

for (const { name, url } of PAGES) {
  test(`dark mode: ${name} has no light-background or low-contrast elements`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(url, { waitUntil: "networkidle" });
    const issues = await auditDark(page);
    expect(issues, issues.slice(0, 6).join("\n")).toEqual([]);
  });
}

test("dark mode: decoder with success + failure cards is clean", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/ithmb-decoder/", { waitUntil: "networkidle" });

  const [chooser1] = await Promise.all([
    page.waitForEvent("filechooser", { timeout: 15000 }),
    page.locator("#dropzone").click(),
  ]);
  await chooser1.setFiles(path.resolve(__dirname, "fixtures/test1.ithmb"));
  await page.waitForFunction(
    () => {
      const s = document.querySelector(".file-card .status");
      return !!s && /decoded|解码成功/i.test(s.textContent ?? "");
    },
    { timeout: 20000 },
  );

  const garbage = path.join(os.tmpdir(), `dark-qa-${Date.now()}.ithmb`);
  fs.writeFileSync(
    garbage,
    Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]),
  );
  const [chooser2] = await Promise.all([
    page.waitForEvent("filechooser", { timeout: 15000 }),
    page.locator("#dropzone").click(),
  ]);
  await chooser2.setFiles(garbage);
  await page.waitForTimeout(2500);
  fs.unlinkSync(garbage);

  const statuses = await page.locator(".file-card .status").allTextContents();
  expect(statuses.some((s) => /decoded|解码成功/i.test(s))).toBeTruthy();
  expect(statuses.some((s) => /unknown|未知/i.test(s))).toBeTruthy();
  expect(await page.locator(".share-box").count()).toBeGreaterThan(0);

  const issues = await auditDark(page);
  expect(issues, issues.slice(0, 6).join("\n")).toEqual([]);
});

test("dark mode: manual toggle flips theme and persists", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/", { waitUntil: "networkidle" });
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("light");

  await page.locator("#themeToggle").click();
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
  expect(await page.evaluate(() => localStorage.getItem("ithmbTheme"))).toBe("dark");
  const issues = await auditDark(page);
  expect(issues, issues.slice(0, 6).join("\n")).toEqual([]);

  // persists across reload
  await page.reload({ waitUntil: "networkidle" });
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");

  // and back to light
  await page.locator("#themeToggle").click();
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("light");
  await page.evaluate(() => localStorage.removeItem("ithmbTheme"));
});
