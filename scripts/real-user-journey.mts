import fs from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { chromium, firefox } from "playwright";
import type { Browser, BrowserType } from "playwright";

// REAL-USER JOURNEY TEST — simulates how an actual person uses the site.
const FIXTURES = join(import.meta.dirname, "..", "tests", "fixtures");
const SITE = "http://localhost:8899";

async function run(browserType: BrowserType<Browser>, label: string) {
  const browser = await browserType.launch({ args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const issues: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console: " + m.text());
  });

  const check = (name: string, ok: boolean, detail = "") => {
    console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? " — " + detail : ""}`);
    if (!ok) issues.push(name);
  };

  console.log(`\n=== ${label} real-user journey ===`);

  // 1. First visit: EN default (fresh browser, no localStorage)
  await page.goto(`${SITE}/ithmb-decoder/?t=${Date.now()}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  check(
    "first visit defaults to EN",
    (await page.evaluate(() => document.documentElement.lang)) === "en",
  );
  check("title is brand-last", (await page.title()).includes("| ITHMB Codec"));
  check("nav visible", (await page.locator(".top-nav-link").count()) >= 3);
  check("lang toggle visible", (await page.locator("#langToggle").count()) === 1);
  check("dropzone visible", await page.locator("#dropzone").isVisible());

  // 2. Drop a file (the core action)
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser", { timeout: 15000 }),
    page.locator("#dropzone").click(),
  ]);
  await chooser.setFiles([`${FIXTURES}/test1.ithmb`]);
  await page
    .waitForFunction(
      () => {
        const s = document.querySelector(".file-card .status");
        return s && !s.textContent.includes("Decoding") && !s.textContent.includes("解码中");
      },
      { timeout: 20000 },
    )
    .catch(() => {});
  const status = await page.evaluate(
    () => document.querySelector(".file-card .status")?.textContent,
  );
  check(
    "file decodes successfully",
    (status?.includes("Decoded") || status?.includes("解码成功")) ?? false,
    status,
  );
  check("card has info panel", (await page.locator(".file-card .info").count()) === 1);
  check("card has save button", (await page.locator(".file-card [data-save]").count()) === 1);
  check("card has report link", (await page.locator(".file-card [data-report]").count()) === 1);
  check("card has format selector", (await page.locator(".file-card .fmt-select").count()) === 1);

  // 3. Change format + save (download flow)
  await page.locator(".file-card .fmt-select").selectOption("image/png");
  await page.waitForTimeout(200);
  const saveText = await page.evaluate(
    () => document.querySelector(".file-card [data-save]")?.textContent,
  );
  check("save button updates to PNG format", saveText?.includes("PNG") ?? false, saveText);
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 10000 }).catch(() => null),
    page.locator(".file-card [data-save]").click(),
  ]);
  check(
    "save downloads a file",
    !!download,
    download ? download.suggestedFilename() : "no download",
  );

  // 4. Viewer: open, navigate with keyboard, close
  const disp = await page.evaluate(
    () => document.getElementById("viewer-container")?.style.display,
  );
  if (disp === "none") {
    await page.locator("#viewToggleBtn").click();
    await page.waitForTimeout(600);
  }
  check(
    "viewer opens",
    (await page.evaluate(() => document.getElementById("viewer-container")?.style.display)) !==
      "none",
  );
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(400);
  check("keyboard navigation works", (await page.locator(".filmstrip-thumb.active").count()) === 1);
  await page.keyboard.press("g");
  await page.waitForTimeout(400);
  check(
    "g toggles grid",
    (await page.evaluate(() => document.getElementById("viewer-container")?.style.display)) ===
      "none",
  );

  // 5. Language switch (the core i18n action)
  await page.locator("#langToggle").click();
  await page.waitForTimeout(1200);
  const zhLang = await page.evaluate(() => document.documentElement.lang);
  check("toggle flips to zh", zhLang === "zh");
  const zhTitle = await page.title();
  check("title flips to zh", zhTitle.includes("ITHMB 解码器"), zhTitle);
  const zhFooter = await page.evaluate(() =>
    document.querySelector("footer")?.textContent.slice(0, 40),
  );
  check("footer flips to zh", zhFooter?.includes("奶茶") ?? false, zhFooter);

  const tmpDir = os.tmpdir();
  const corruptPath = join(tmpDir, "corrupt-share.ithmb");
  try {
    const src = fs.readFileSync(`${FIXTURES}/test1.ithmb`);
    fs.writeFileSync(corruptPath, src.subarray(0, 100));
    const [chooser2] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 15000 }),
      page.locator("#dropzone").click(),
    ]);
    await chooser2.setFiles([corruptPath]);
    await page.waitForTimeout(3000);
    const shareBtns = await page.evaluate(() => {
      const box = document.querySelector(".share-box");
      return box ? box.textContent.includes("分享") : false;
    });
    check("failure card shows zh share options", shareBtns);
  } finally {
    fs.rmSync(corruptPath, { force: true });
  }

  // 7. Report form: open, select issue, stays open on lang switch
  await page.locator(".file-card [data-report]").first().click();
  await page.waitForTimeout(400);
  const formOpen = await page.evaluate(
    () => !document.querySelector<HTMLElement>(".file-card .report-form")?.hidden,
  );
  check("report form opens", formOpen);
  const issueLabels = await page.evaluate(() =>
    [...document.querySelectorAll(".report-issue")].map((el) => el.textContent.trim()).join("|"),
  );
  check(
    "issue MCQs are plain language (no jargon)",
    !issueLabels.includes("Stride") && !issueLabels.includes("Byte order"),
    issueLabels.slice(0, 60),
  );
  await page.locator("#langToggle").click();
  await page.waitForTimeout(1200);
  const formStillOpen = await page.evaluate(
    () => !document.querySelector<HTMLElement>(".file-card .report-form")?.hidden,
  );
  check("form stays open on lang switch", formStillOpen);

  // 8. Mobile viewport
  const mobile = await ctx.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(`${SITE}/ithmb-decoder/?t=${Date.now()}`, { waitUntil: "domcontentloaded" });
  await mobile.waitForTimeout(2000);
  check(
    "mobile: no horizontal scroll",
    await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2),
  );
  const [chooser3] = await Promise.all([
    mobile.waitForEvent("filechooser", { timeout: 15000 }),
    mobile.locator("#dropzone").click(),
  ]);
  await chooser3.setFiles([`${FIXTURES}/test1.ithmb`]);
  await mobile.waitForTimeout(3000);
  check("mobile: decode works", (await mobile.locator(".file-card").count()) === 1);

  // 9. Home page
  await page.goto(`${SITE}/?t=${Date.now()}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  check("home page loads", (await page.locator("h2").count()) > 0);
  check(
    "home cards link to decoder",
    (await page.locator('a.card[href*="ithmb-decoder"]').count()) > 0,
  );

  // 10. 404 page
  await page.goto(`${SITE}/nonexistent-page-xyz?t=${Date.now()}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2000);
  check(
    "404 shows",
    ((await page.locator("h1").count()) > 0 && (await page.title()).includes("Not Found")) ||
      (await page.title()).includes("未找到"),
  );

  // 11. NO JS errors anywhere
  // Ignore the expected 404-resource log from the 404-navigation test
  // (browsers log a console error when the server correctly returns 404).
  const realErrors = errors.filter(
    (e) => !e.includes("status of 404") && !e.includes("Failed to load resource"),
  );
  check(
    "zero JS errors across journey",
    realErrors.length === 0,
    realErrors.join("; ").slice(0, 120),
  );

  console.log(`\n${label}: ${issues.length === 0 ? "ALL CLEAN" : issues.length + " ISSUES"}`);
  await browser.close();
  return issues;
}

(async () => {
  const c = await run(chromium, "chromium");
  const f = await run(firefox, "firefox");
  console.log("\n==================");
  console.log("TOTAL ISSUES — chromium:", c.length, "| firefox:", f.length);
  if (c.length + f.length > 0) console.log([...new Set([...c, ...f])].join("\n"));
  else console.log("No user-facing problems found in either browser.");
})().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
