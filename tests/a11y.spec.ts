import path from "path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Accessibility gate. Every page is audited in light AND dark theme for
// critical/serious WCAG A/AA issues, including colour contrast (CH-15: the rule
// used to be excluded here, which hid the dark guide-rail number regression).
// Interactive states (decoder loading/failure, confirm dialog, mobile drawer,
// guide lightbox) are audited too, because that is where the fix batches kept
// regressing.
//
// Reduced motion is emulated for the audit: the page's reveal elements fade in
// over 0.95 s, and axe samples colours mid-transition otherwise, producing
// blended-colour false positives. Reduced motion is also a real user state.
type Theme = "light" | "dark";
const THEMES: Theme[] = ["light", "dark"];

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];

async function prepare(page: Page, theme: Theme): Promise<void> {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
}

// Shared gate: collect critical/serious violations. Nothing is excluded —
// colour contrast included.
async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
}

async function expectClean(page: Page, label: string): Promise<void> {
  const serious = await seriousViolations(page);
  if (serious.length > 0) {
    console.log(`\n=== ${label}: ${serious.length} critical/serious violations ===`);
    for (const v of serious) {
      console.log(`  ${v.id}: ${v.help}`);
      console.log(`  Impact: ${v.impact}`);
      console.log(`  Elements: ${v.nodes.length}`);
      console.log(`  URL: ${v.helpUrl}`);
      for (const node of v.nodes.slice(0, 3)) console.log(`    target: ${node.target.join(" ")}`);
    }
  }
  // Authoritative gate: any unexpected critical/serious violation fails CI.
  expect(serious).toHaveLength(0);
}

const PAGES = [
  { name: "Home", url: "/" },
  { name: "Decoder", url: "/ithmb-decoder/" },
  { name: "Guide", url: "/guide/how-to-open-ithmb-files.html" },
  { name: "Privacy", url: "/privacy/" },
  { name: "Third-party notices", url: "/third-party-notices.html" },
  { name: "404", url: "/nonexistent" },
  { name: "Home (zh)", url: "/zh/" },
  { name: "Decoder (zh)", url: "/zh/ithmb-decoder/" },
  { name: "Guide (zh)", url: "/zh/guide/how-to-open-ithmb-files.html" },
  { name: "Privacy (zh)", url: "/zh/privacy/" },
  { name: "Third-party notices (zh)", url: "/zh/third-party-notices.html" },
];

for (const theme of THEMES) {
  for (const { name, url } of PAGES) {
    test(`${name} page has no critical accessibility violations (${theme})`, async ({ page }) => {
      await prepare(page, theme);
      await page.goto(url);
      await page.waitForLoadState("domcontentloaded");
      await page.waitForSelector("header, nav, main, #dropzone");
      // Let the decoder finish init so the audit covers the settled page.
      if (url.includes("ithmb-decoder") || url.includes("/zh/ithmb")) {
        await page.waitForSelector('html[data-decoder-state="ready"]', { timeout: 40000 });
      }
      await expectClean(page, `${name} (${theme})`);
    });
  }
}

test.describe("Decoder states", () => {
  for (const theme of THEMES) {
    test(`decoded results + viewer have no critical issues (${theme})`, async ({ page }) => {
      await prepare(page, theme);
      await page.goto("/ithmb-decoder/");
      await page.waitForSelector('html[data-decoder-state="ready"]', { timeout: 40000 });
      await page.setInputFiles("#fileInput", path.resolve(__dirname, "fixtures/test1.ithmb"));
      await expect
        .poll(() => page.evaluate(() => document.body.dataset.decodePhase ?? null), {
          timeout: 30000,
        })
        .toBe("settled");
      await expect(page.locator(".file-card")).toHaveCount(1);
      await expect(page.locator("#viewer-container")).toBeVisible();
      await expectClean(page, `decoder loaded (${theme})`);
    });

    test(`decode failure has no critical issues (${theme})`, async ({ page }) => {
      await prepare(page, theme);
      await page.goto("/ithmb-decoder/");
      await page.waitForSelector('html[data-decoder-state="ready"]', { timeout: 40000 });
      await page.setInputFiles("#fileInput", path.resolve(__dirname, "fixtures/garbage.ithmb"));
      await expect
        .poll(() => page.evaluate(() => document.body.dataset.decodePhase ?? null), {
          timeout: 30000,
        })
        .toBe("settled");
      await expect(page.locator(".failure-info").first()).toBeVisible();
      await expectClean(page, `decoder failure (${theme})`);
    });

    test(`init failure panel has no critical issues (${theme})`, async ({ page }) => {
      await prepare(page, theme);
      await page.route("**/*.wasm*", (route) => route.abort());
      await page.goto("/ithmb-decoder/");
      await page.waitForSelector("#loadFailed", { state: "visible", timeout: 20000 });
      await expectClean(page, `decoder init failure (${theme})`);
    });

    test(`confirm dialog has no critical issues and isolates the background (${theme})`, async ({
      page,
    }) => {
      await prepare(page, theme);
      await page.goto("/ithmb-decoder/");
      await page.waitForSelector('html[data-decoder-state="ready"]', { timeout: 40000 });
      await page.setInputFiles("#fileInput", path.resolve(__dirname, "fixtures/test1.ithmb"));
      await expect(page.locator(".file-card")).toHaveCount(1);
      await page.locator("#clearBtn").click();
      await expect(page.locator("#confirmDialog")).toHaveClass(/active/);
      // Background isolation: landmarks behind the modal are inert.
      await expect(page.locator("main")).toHaveJSProperty("inert", true);
      await expect(page.locator("nav.top-nav")).toHaveJSProperty("inert", true);
      await expectClean(page, `confirm dialog (${theme})`);
      await page.keyboard.press("Escape");
      await expect(page.locator("#confirmDialog")).not.toHaveClass(/active/);
      await expect(page.locator("main")).toHaveJSProperty("inert", false);
      await expect(page.locator("body")).not.toHaveClass(/modal-open/);
    });

    test(`mobile drawer has no critical issues and isolates the background (${theme})`, async ({
      page,
    }) => {
      await prepare(page, theme);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/");
      await page.locator("#navToggle").click();
      await expect(page.locator("body")).toHaveClass(/nav-open/);
      await expect(page.locator("main")).toHaveJSProperty("inert", true);
      // The drawer lives inside the nav, so the nav itself must stay active.
      await expect(page.locator("nav.top-nav")).toHaveJSProperty("inert", false);
      await expectClean(page, `mobile drawer (${theme})`);
      await page.keyboard.press("Escape");
      await expect(page.locator("body")).not.toHaveClass(/nav-open/);
      await expect(page.locator("main")).toHaveJSProperty("inert", false);
      await expect(page.locator("#navToggle")).toBeFocused();
    });

    test(`guide lightbox has no critical issues and isolates the background (${theme})`, async ({
      page,
    }) => {
      await prepare(page, theme);
      await page.goto("/guide/how-to-open-ithmb-files.html");
      const trigger = page.locator("[data-guide-lightbox]").first();
      await trigger.click();
      await expect(page.locator(".guide-lightbox")).toBeVisible();
      await expect(page.locator("main")).toHaveJSProperty("inert", true);
      await expectClean(page, `guide lightbox (${theme})`);
      await page.keyboard.press("Escape");
      await expect(page.locator(".guide-lightbox")).toBeHidden();
      await expect(page.locator("main")).toHaveJSProperty("inert", false);
      await expect(trigger).toBeFocused();
    });
  }
});
