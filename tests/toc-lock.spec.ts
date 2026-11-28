// TOC click-lock contract for both rails: the item you click must light up
// immediately and stay lit for the whole smooth scroll. The scrollspy is not
// allowed to override it in between, and the lock must release as soon as the
// target arrives (scrollend primary, destination geometry fallback) — not on a
// fixed timer — or immediately on manual wheel/touch/key input.
import { expect, test, type Page } from "@playwright/test";

const privacyActive = (page: Page) =>
  page.evaluate(
    () => document.querySelector(".privacy-toc__link.is-active")?.getAttribute("href") ?? null,
  );

const railActive = (page: Page) =>
  page.evaluate(
    () =>
      document.querySelector(".guide-rail__step.is-active")?.getAttribute("data-rail-step") ?? null,
  );

/** Sample one attribute every 25 ms for `ms`, inside the page (no round trips). */
function sampleAttribute(page: Page, selector: string, attribute: string, ms: number) {
  return page.evaluate(
    async ([sel, attr, duration]) => {
      const out: (string | null)[] = [];
      const end = performance.now() + (duration as number);
      while (performance.now() < end) {
        out.push(
          (document.querySelector(sel as string) as HTMLElement | null)?.getAttribute(
            attr as string,
          ) ?? null,
        );
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      return out;
    },
    [selector, attribute, ms],
  );
}

const samplePrivacy = (page: Page, ms = 500) =>
  sampleAttribute(page, ".privacy-toc__link.is-active", "href", ms);

const sampleRail = (page: Page, ms = 500) =>
  sampleAttribute(page, ".guide-rail__step.is-active", "data-rail-step", ms);

const clickInPage = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!(el instanceof HTMLElement)) throw new Error(`missing ${sel}`);
    el.click();
  }, selector);

const instantScrollTo = (page: Page, id: string) =>
  page.evaluate((target) => {
    const el = document.getElementById(target);
    if (!el) throw new Error(`missing #${target}`);
    window.scrollTo({
      top: el.getBoundingClientRect().top + window.scrollY,
      behavior: "instant" as ScrollBehavior,
    });
  }, id);

const scrollY = (page: Page) => page.evaluate(() => window.scrollY);

/** Wait until a click-triggered smooth scroll has actually moved the page. */
async function waitForScrollStart(page: Page, from = 0): Promise<void> {
  await expect.poll(() => scrollY(page), { timeout: 5000 }).toBeGreaterThan(from);
}

test.describe("Privacy rail click lock", () => {
  test("clicked item holds through the whole scroll (middle target, downward)", async ({
    page,
  }) => {
    await page.goto("/privacy/", { waitUntil: "networkidle" });
    await expect.poll(() => privacyActive(page)).toBe("#files");

    await page.locator('.privacy-toc__link[href="#hosting"]').click();
    // Immediately after the click, before the scroll has moved: clicked wins.
    expect(await privacyActive(page)).toBe("#hosting");

    const samples = await samplePrivacy(page, 600);
    expect(samples.every((href) => href === "#hosting")).toBe(true);
    expect(await scrollY(page)).toBeGreaterThan(200);

    // Release proof: an out-of-band position change must now win, which can
    // only happen once the click lock is gone.
    await instantScrollTo(page, "changes");
    await expect.poll(() => privacyActive(page)).toBe("#changes");
  });

  test("clicked item holds while scrolling upward (bottom -> top)", async ({ page }) => {
    await page.goto("/privacy/", { waitUntil: "networkidle" });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => privacyActive(page)).toBe("#changes");
    const before = await scrollY(page);

    await page.locator('.privacy-toc__link[href="#files"]').click();
    expect(await privacyActive(page)).toBe("#files");
    const samples = await samplePrivacy(page, 600);
    expect(samples.every((href) => href === "#files")).toBe(true);
    expect(await scrollY(page)).toBeLessThan(before - 1000);

    await instantScrollTo(page, "dont");
    await expect.poll(() => privacyActive(page)).toBe("#dont");
  });

  test("rapid clicks: the last click wins and is held", async ({ page }) => {
    await page.goto("/privacy/", { waitUntil: "networkidle" });
    await expect.poll(() => privacyActive(page)).toBe("#files");
    await clickInPage(page, '.privacy-toc__link[href="#changes"]');
    await waitForScrollStart(page);
    await clickInPage(page, '.privacy-toc__link[href="#hosting"]');
    expect(await privacyActive(page)).toBe("#hosting");
    const samples = await samplePrivacy(page, 600);
    expect(samples.every((href) => href === "#hosting")).toBe(true);
    await expect.poll(() => privacyActive(page)).toBe("#hosting");
  });

  test("manual wheel input releases the lock immediately", async ({ page }) => {
    await page.goto("/privacy/", { waitUntil: "networkidle" });
    await page.locator('.privacy-toc__link[href="#changes"]').click();
    await waitForScrollStart(page);
    expect(await privacyActive(page)).toBe("#changes");
    const after = await page.evaluate(async () => {
      window.dispatchEvent(new Event("wheel"));
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      return document.querySelector(".privacy-toc__link.is-active")?.getAttribute("href") ?? null;
    });
    expect(after).not.toBe("#changes");
  });

  test("key input releases the lock immediately", async ({ page }) => {
    await page.goto("/privacy/", { waitUntil: "networkidle" });
    await page.locator('.privacy-toc__link[href="#changes"]').click();
    await waitForScrollStart(page);
    expect(await privacyActive(page)).toBe("#changes");
    const after = await page.evaluate(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "PageDown" }));
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      return document.querySelector(".privacy-toc__link.is-active")?.getAttribute("href") ?? null;
    });
    expect(after).not.toBe("#changes");
  });

  test("reduced motion: instant jump keeps the click and releases at once", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/privacy/", { waitUntil: "networkidle" });
    await page.locator('.privacy-toc__link[href="#changes"]').click();
    expect(await privacyActive(page)).toBe("#changes");
    const held = await samplePrivacy(page, 250);
    expect(held.every((href) => href === "#changes")).toBe(true);
    await instantScrollTo(page, "hosting");
    await expect.poll(() => privacyActive(page)).toBe("#hosting");
  });
});

test.describe("Guide progress rail click lock", () => {
  test("clicked step holds through the whole scroll (last step, downward)", async ({ page }) => {
    await page.goto("/guide/how-to-open-ithmb-files.html", { waitUntil: "networkidle" });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => railActive(page)).toBe("step-1");

    await page.locator('[data-rail-step="step-3"]').click();
    expect(await railActive(page)).toBe("step-3");
    const samples = await sampleRail(page, 600);
    expect(samples.every((step) => step === "step-3")).toBe(true);
    expect(await scrollY(page)).toBeGreaterThan(400);

    await instantScrollTo(page, "step-1");
    await expect.poll(() => railActive(page)).toBe("step-1");
  });

  test("clicked step holds while scrolling upward", async ({ page }) => {
    await page.goto("/guide/how-to-open-ithmb-files.html", { waitUntil: "networkidle" });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => railActive(page)).toBe("step-3");
    const before = await scrollY(page);

    await page.locator('[data-rail-step="step-1"]').click();
    expect(await railActive(page)).toBe("step-1");
    const samples = await sampleRail(page, 600);
    expect(samples.every((step) => step === "step-1")).toBe(true);
    expect(await scrollY(page)).toBeLessThan(before - 1000);

    await instantScrollTo(page, "step-3");
    await expect.poll(() => railActive(page)).toBe("step-3");
  });

  test("middle step, rapid clicks and a short-distance release", async ({ page }) => {
    await page.goto("/guide/how-to-open-ithmb-files.html", { waitUntil: "networkidle" });
    await page.evaluate(() => window.scrollTo(0, 0));

    await page.locator('[data-rail-step="step-2"]').click();
    expect(await railActive(page)).toBe("step-2");
    const samples = await sampleRail(page, 500);
    expect(samples.every((step) => step === "step-2")).toBe(true);

    // Rapid clicks keep the last clicked step, never an intermediate spy value.
    // One animation frame lets the first click's smooth scroll start (as the
    // old 80 ms sleep did) without turning the two clicks into separate
    // interactions.
    await clickInPage(page, '[data-rail-step="step-3"]');
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
    await clickInPage(page, '[data-rail-step="step-2"]');
    expect(await railActive(page)).toBe("step-2");
    const rapid = await sampleRail(page, 500);
    expect(rapid.every((step) => step === "step-2")).toBe(true);

    // Once the scroll has landed the lock must be gone (no minimum hold): a
    // later position change wins immediately.
    await expect.poll(() => railActive(page)).toBe("step-2");
    await instantScrollTo(page, "step-3");
    await expect.poll(() => railActive(page), { timeout: 2000 }).toBe("step-3");
  });

  test("manual wheel and key input release the lock immediately", async ({ page }) => {
    await page.goto("/guide/how-to-open-ithmb-files.html", { waitUntil: "networkidle" });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('[data-rail-step="step-3"]').click();
    await waitForScrollStart(page);
    expect(await railActive(page)).toBe("step-3");

    const afterWheel = await page.evaluate(async () => {
      window.dispatchEvent(new Event("wheel"));
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      return (
        document.querySelector(".guide-rail__step.is-active")?.getAttribute("data-rail-step") ??
        null
      );
    });
    expect(afterWheel).not.toBe("step-3");

    await page.locator('[data-rail-step="step-3"]').click();
    await waitForScrollStart(page);
    const afterKey = await page.evaluate(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "PageDown" }));
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      return (
        document.querySelector(".guide-rail__step.is-active")?.getAttribute("data-rail-step") ??
        null
      );
    });
    expect(afterKey).not.toBe("step-3");
  });

  test("reduced motion: instant jump keeps the click and releases at once", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/guide/how-to-open-ithmb-files.html", { waitUntil: "networkidle" });
    await page.locator('[data-rail-step="step-3"]').click();
    expect(await railActive(page)).toBe("step-3");
    const held = await sampleRail(page, 250);
    expect(held.every((step) => step === "step-3")).toBe(true);
    await instantScrollTo(page, "step-1");
    await expect.poll(() => railActive(page)).toBe("step-1");
  });
});
