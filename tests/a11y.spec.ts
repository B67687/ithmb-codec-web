import path from "path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Shared gate: collect critical/serious violations minus documented exclusions.
async function seriousViolations(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
    .analyze();
  const KNOWN_A11Y_EXCLUSIONS = new Set(["color-contrast"]);
  return results.violations.filter(
    (v) => (v.impact === "critical" || v.impact === "serious") && !KNOWN_A11Y_EXCLUSIONS.has(v.id),
  );
}

test.describe("Accessibility", () => {
  const pages = [
    { name: "Home", url: "/" },
    { name: "Decoder", url: "/ithmb-decoder/" },
    { name: "Guide", url: "/guide/how-to-open-ithmb-files.html" },
    { name: "Enterprise", url: "/enterprise/" },
    { name: "404", url: "/nonexistent" },
    { name: "Home (zh)", url: "/zh/" },
    { name: "Decoder (zh)", url: "/zh/ithmb-decoder/" },
    { name: "Guide (zh)", url: "/zh/guide/how-to-open-ithmb-files.html" },
    { name: "Enterprise (zh)", url: "/zh/enterprise/" },
  ];

  for (const { name, url } of pages) {
    test(`${name} page has no critical accessibility violations`, async ({ page }) => {
      await page.goto(url);
      await page.waitForLoadState("networkidle");

      const serious = await seriousViolations(page);

      if (serious.length > 0) {
        console.log(`\n=== ${name}: ${serious.length} critical/serious violations ===`);
        for (const v of serious) {
          console.log(`  ${v.id}: ${v.help}`);
          console.log(`  Impact: ${v.impact}`);
          console.log(`  Elements: ${v.nodes.length}`);
          console.log(`  URL: ${v.helpUrl}`);
        }
      }

      // Authoritative gate: any unexpected critical/serious violation fails CI.
      // Known intentional exclusions (e.g. color-contrast) are listed above.
      expect(serious).toHaveLength(0);
    });
  }
});

test("Decoder post-upload state has no critical accessibility violations", async ({ page }) => {
  await page.goto("/ithmb-decoder/");
  await page.waitForLoadState("networkidle");
  const [fc] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.locator("#dropzone").click(),
  ]);
  await fc.setFiles(path.resolve(__dirname, "fixtures/test1.ithmb"));
  await expect(page.locator(".file-card")).toHaveCount(1);
  const serious = await seriousViolations(page);
  expect(serious).toHaveLength(0);
});
