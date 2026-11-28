// Appended by fix pass 2: interaction policy tests (links, confirmations, privacy).
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import path from "node:path";

const FIXTURES = path.join(__dirname, "fixtures");

async function loadTestFile(page: Page): Promise<void> {
  const [fc] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.locator("#dropzone").click(),
  ]);
  await fc.setFiles([path.join(FIXTURES, "test1.ithmb")]);
  await expect(page.locator(".file-card .status")).not.toContainText("Decoding...", {
    timeout: 15000,
  });
  await expect(page.locator(".file-card")).toHaveCount(1);
}

test.describe("Navigation policy: external and decoder-context links", () => {
  test("external links are new-tab, safe-rel and announced (EN + ZH)", async ({ page }) => {
    for (const url of ["/", "/zh/"]) {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".site-footer");
      const external = page.locator(".site-footer a[href^='http']");
      const count = await external.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        const link = external.nth(i);
        await expect(link).toHaveAttribute("target", "_blank");
        const rel = (await link.getAttribute("rel")) || "";
        expect(rel).toContain("noopener");
        expect(rel).toContain("noreferrer");
        const hint = await link.locator(".sr-only").textContent();
        expect(hint).toMatch(url.startsWith("/zh/") ? /在新标签页打开/ : /opens in a new tab/);
      }
      // No new-tab link may miss a safe rel anywhere on the page.
      const blank = page.locator("a[target='_blank']");
      const n = await blank.count();
      for (let i = 0; i < n; i++) {
        const rel = (await blank.nth(i).getAttribute("rel")) || "";
        expect(rel).toContain("noopener");
      }
    }
  });

  test("static nav/footer internal links stay in the same tab", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".site-footer");
    for (const href of ["/", "/ithmb-decoder/", "/guide/how-to-open-ithmb-files"]) {
      const link = page.locator(`a[href="${href}"]`).first();
      await expect(link).not.toHaveAttribute("target", "_blank");
    }
  });
});

test.describe("Destructive actions confirm before losing decoded files", () => {
  test("language switch with no files loaded stays a plain same-tab link", async ({ page }) => {
    await page.goto("/ithmb-decoder/");
    const lang = page.locator("#langToggle");
    await expect(lang).not.toHaveAttribute("target", "_blank");
    // The confirm dialog is created lazily; with nothing loaded it never opens.
    expect(await page.locator("#confirmDialog").count()).toBe(0);
  });

  test("Clear asks first: Escape keeps the decode, confirm clears it", async ({ page }) => {
    await page.goto("/ithmb-decoder/");
    await loadTestFile(page);
    await page.locator("#clearBtn").click();
    const dialog = page.locator("#confirmDialog");
    await expect(dialog).toHaveClass(/active/);
    await expect(dialog.locator("#confirmTitle")).toContainText(/Clear the decoded files/i);
    await expect(dialog.locator("#confirmMessage")).toContainText(/reloads the decoder/i);
    expect(await page.evaluate(() => !!document.activeElement?.closest("#confirmDialog"))).toBe(
      true,
    );

    await page.keyboard.press("Escape");
    await expect(dialog).not.toHaveClass(/active/);
    await expect(page.locator(".file-card")).toHaveCount(1);

    const reload = page.waitForLoadState("domcontentloaded", { timeout: 15000 });
    await page.locator("#clearBtn").click();
    await page.locator('#confirmDialog [data-confirm="ok"]').click();
    await reload;
    await expect(page.locator(".file-card")).toHaveCount(0);
  });

  test("language switch confirms when files are loaded and navigates only after OK", async ({
    page,
  }) => {
    await page.goto("/ithmb-decoder/");
    await loadTestFile(page);
    await page.locator("#langToggle").click();
    const dialog = page.locator("#confirmDialog");
    await expect(dialog).toHaveClass(/active/);
    await expect(dialog.locator("#confirmMessage")).toContainText(/clears the files you loaded/i);

    await page.locator('#confirmDialog [data-confirm="cancel"]').click();
    await expect(dialog).not.toHaveClass(/active/);
    expect(page.url()).toContain("/ithmb-decoder/");
    await expect(page.locator(".file-card")).toHaveCount(1);

    const navigated = page.waitForURL(/\/zh\/ithmb-decoder\//, { timeout: 15000 });
    await page.locator("#langToggle").click();
    await page.locator('#confirmDialog [data-confirm="ok"]').click();
    await navigated;
  });
});

test.describe("Decoded data stays in memory only", () => {
  test("no filenames/bytes in URL, storage or cookies; only theme + language persist", async ({
    page,
  }) => {
    await page.goto("/ithmb-decoder/");
    await loadTestFile(page);
    const state = await page.evaluate(() => ({
      localKeys: Object.keys(localStorage),
      sessionKeys: Object.keys(sessionStorage),
      cookie: document.cookie,
      href: location.href,
      title: document.title,
    }));
    for (const key of state.localKeys) {
      expect(["ithmbTheme", "ithmbLang"]).toContain(key);
    }
    expect(state.sessionKeys).toEqual([]);
    expect(state.cookie).toBe("");
    expect(state.href).not.toMatch(/test1|ithmb-pictures-converted/i);
    expect(state.title).not.toMatch(/test1/i);
  });
});
