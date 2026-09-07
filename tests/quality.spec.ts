import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

interface TelemetryPayload {
  header?: string;
  prefix?: number;
  fileSize?: number;
  status?: string;
  full_file?: string;
  issue?: string;
}

const FIXTURES = path.join(__dirname, "fixtures");

// ─── Mobile Responsive ─────────────────────────────────────────────────────

test.describe("Mobile responsive", () => {
  test("home page fits viewport at 375px (iPhone)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(380);
  });

  test("decoder page layout at 375px (iPhone)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/ithmb-decoder/");
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(380);
    const dropzone = page.locator("#dropzone");
    const dzBox = await dropzone.boundingBox();
    expect(dzBox).not.toBeNull();
    expect(dzBox!.width).toBeLessThanOrEqual(370);
  });

  test("home page layout at 768px (iPad)", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/");
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(773);
  });

  test("guide page layout at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/guide/how-to-open-ithmb-files.html");
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(380);
  });
});

// ─── Keyboard Accessibility ─────────────────────────────────────────────────

test.describe("Keyboard navigation", () => {
  test("Tab navigates through interactive elements on home page", async ({ page }) => {
    await page.goto("/");
    const elements = [];
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press("Tab");
      const tag = await page.evaluate(() => {
        const el = document.activeElement;
        return el ? `${el.tagName}#${el.id}` : "";
      });
      if (tag) elements.push(tag);
    }
    expect(elements.length).toBeGreaterThan(3);
  });

  test("Escape closes viewer", async ({ page }) => {
    await page.goto("/ithmb-decoder/");
    const [fc] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.locator("#dropzone").click(),
    ]);
    await fc.setFiles([path.join(FIXTURES, "test1.ithmb")]);
    await page.waitForTimeout(3000);
    await page.locator(".file-card").first().click();
    await page.waitForTimeout(500);
    const viewer = page.locator("#viewer-container");
    await expect(viewer).toBeVisible();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await expect(viewer).not.toBeVisible();
  });

  test("arrow keys navigate between decoded images", async ({ page }) => {
    await page.goto("/ithmb-decoder/");
    const [fc] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.locator("#dropzone").click(),
    ]);
    await fc.setFiles([
      path.join(FIXTURES, "test1.ithmb"),
      path.join(FIXTURES, "test2.ithmb"),
      path.join(FIXTURES, "test3.ithmb"),
      path.join(FIXTURES, "test4.ithmb"),
    ]);
    await page.waitForTimeout(5000);
    await page.locator(".file-card").first().click();
    await page.waitForTimeout(500);
    const pos1 = await page.locator("#viewerPos").textContent();
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(300);
    const pos2 = await page.locator("#viewerPos").textContent();
    expect(pos1).not.toBe(pos2);
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(300);
    const pos3 = await page.locator("#viewerPos").textContent();
    expect(pos3).toBe(pos1);
  });
});

// ─── Error States ───────────────────────────────────────────────────────────

test.describe("Error states", () => {
  test("invalid file shows error toast", async ({ page }) => {
    await page.goto("/ithmb-decoder/");
    // Unique name: chromium+firefox run in parallel — a shared name races
    // (one worker's unlink deletes while the other is mid-test).
    const invalidFile = path.join(
      FIXTURES,
      "invalid-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ".bin",
    );
    fs.writeFileSync(invalidFile, Buffer.alloc(64, 0xff));
    const [fc] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.locator("#dropzone").click(),
    ]);
    await fc.setFiles([invalidFile]);
    await page.waitForTimeout(3000);
    const toast = page.locator(".toast");
    await expect(toast).toBeVisible({ timeout: 10000 });
    await expect(toast).toContainText(/skipped/i);
    fs.rmSync(invalidFile, { force: true });
  });

  test("corrupt .ithmb shows share card, not an error", async ({ page }) => {
    await page.goto("/ithmb-decoder/");
    // Valid fixture truncated to 100 bytes: known prefix intact, payload corrupt
    const corruptFile = path.join(FIXTURES, "corrupt-share.ithmb");
    fs.writeFileSync(
      corruptFile,
      fs.readFileSync(path.join(FIXTURES, "test1.ithmb")).subarray(0, 100),
    );
    const [fc] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.locator("#dropzone").click(),
    ]);
    await fc.setFiles([corruptFile]);

    const card = page.locator(".file-card");
    await expect(card.locator(".share-box")).toBeVisible({ timeout: 10000 });
    // Regression: decodeFile used to swallow a null-addEventListener crash and
    // render the generic Error card instead of the share prompt.
    await expect(card.locator(".status")).not.toContainText("Error");
    await expect(card.locator(".share-heading")).toHaveText("Help improve the decoder");
    await expect(card.locator('[data-share="header"]')).toHaveText("Share 16 bytes");
    await expect(card.locator('[data-share="full"]')).toHaveText("Share full file");
    await expect(card.locator(".share-hexdump code")).toContainText(
      /[0-9a-f]{2}( [0-9a-f]{2}){15}/,
    );
    fs.rmSync(corruptFile, { force: true });
  });

  test("Share 16 bytes posts header-only payload and disables buttons", async ({ page }) => {
    await page.goto("/ithmb-decoder/");
    const corruptFile = path.join(FIXTURES, "corrupt-header.ithmb");
    fs.writeFileSync(
      corruptFile,
      fs.readFileSync(path.join(FIXTURES, "test1.ithmb")).subarray(0, 100),
    );
    const [fc] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.locator("#dropzone").click(),
    ]);
    await fc.setFiles([corruptFile]);

    const card = page.locator(".file-card");
    await expect(card.locator('[data-share="header"]')).toBeVisible({
      timeout: 10000,
    });

    // Intercept the telemetry POST; fulfill 200 so the app sees a successful share
    const posted: TelemetryPayload[] = [];
    await page.route("**/ithmb-telemetry.ithmb-codec.workers.dev/**", async (route) => {
      if (route.request().method() === "POST") {
        posted.push(JSON.parse(route.request().postData() || "{}"));
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: '{"ok":true}',
      });
    });

    const headerBtn = card.locator('[data-share="header"]');
    await headerBtn.click();
    await expect(headerBtn).toHaveText("Shared ✓");
    await expect(headerBtn).toBeDisabled();
    await expect(card.locator('[data-share="full"]')).not.toBeDisabled();
    await expect(page.locator(".toast")).toContainText(/shared/i);

    await expect.poll(() => posted.length, { timeout: 5000 }).toBe(1);
    const body = posted[0];
    if (!body) throw new Error("no telemetry posted");
    expect(body.header).toMatch(/^[0-9a-f]{32}$/);
    expect(body.prefix).toBeGreaterThan(0);
    expect(body.fileSize).toBeGreaterThan(0);
    expect(["known-failed", "unknown"]).toContain(body.status);
    expect(body.full_file).toBeUndefined();
    fs.rmSync(corruptFile, { force: true });
  });

  test("Share full file posts full_file base64 payload", async ({ page }) => {
    await page.goto("/ithmb-decoder/");
    const corruptBytes = fs.readFileSync(path.join(FIXTURES, "test1.ithmb")).subarray(0, 100);
    const corruptFile = path.join(FIXTURES, "corrupt-full.ithmb");
    fs.writeFileSync(corruptFile, corruptBytes);
    const [fc] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.locator("#dropzone").click(),
    ]);
    await fc.setFiles([corruptFile]);

    const card = page.locator(".file-card");
    await expect(card.locator('[data-share="full"]')).toBeVisible({
      timeout: 10000,
    });

    const posted: TelemetryPayload[] = [];
    await page.route("**/ithmb-telemetry.ithmb-codec.workers.dev/**", async (route) => {
      if (route.request().method() === "POST") {
        posted.push(JSON.parse(route.request().postData() || "{}"));
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: '{"ok":true}',
      });
    });

    await card.locator('[data-share="full"]').click();
    await expect.poll(() => posted.length, { timeout: 5000 }).toBe(1);
    const body = posted[0];
    if (!body) throw new Error("no telemetry posted");
    expect(typeof body.full_file).toBe("string");
    // Round-trip: decoded base64 must equal the exact fixture bytes
    expect(Buffer.from(body.full_file, "base64").length).toBe(corruptBytes.length);
    expect(card.locator('[data-share="full"]')).toHaveText("Shared ✓");
    await expect(card.locator('[data-share="header"]')).toBeDisabled();
    await expect(card.locator('[data-share="header"]')).toHaveAttribute(
      "title",
      /Full file already shared/,
    );
    fs.rmSync(corruptFile, { force: true });
  });

  test("double-clicking Share 16 bytes sends exactly one POST", async ({ page }) => {
    await page.goto("/ithmb-decoder/");
    const corruptFile = path.join(FIXTURES, "corrupt-dedup.ithmb");
    fs.writeFileSync(
      corruptFile,
      fs.readFileSync(path.join(FIXTURES, "test1.ithmb")).subarray(0, 100),
    );
    const [fc] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.locator("#dropzone").click(),
    ]);
    await fc.setFiles([corruptFile]);

    const card = page.locator(".file-card");
    await expect(card.locator('[data-share="header"]')).toBeVisible({
      timeout: 10000,
    });

    const posted: TelemetryPayload[] = [];
    await page.route("**/ithmb-telemetry.ithmb-codec.workers.dev/**", async (route) => {
      if (route.request().method() === "POST") {
        posted.push(JSON.parse(route.request().postData() || "{}"));
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: '{"ok":true}',
      });
    });

    const headerBtn = card.locator('[data-share="header"]');
    await headerBtn.click();
    // The button disables after the first click — a second attempt is a no-op
    await headerBtn.click({ force: true });
    await expect.poll(() => posted.length, { timeout: 5000 }).toBe(1);
    await expect(headerBtn).toBeDisabled();
    // Sharing the header does NOT lock the full-file option
    await expect(card.locator('[data-share="full"]')).not.toBeDisabled();
    fs.rmSync(corruptFile, { force: true });
  });

  test("sharing 16 bytes then full file sends both payloads", async ({ page }) => {
    await page.goto("/ithmb-decoder/");
    const corruptBytes = fs.readFileSync(path.join(FIXTURES, "test1.ithmb")).subarray(0, 100);
    const corruptFile = path.join(FIXTURES, "corrupt-upgrade.ithmb");
    fs.writeFileSync(corruptFile, corruptBytes);
    const [fc] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.locator("#dropzone").click(),
    ]);
    await fc.setFiles([corruptFile]);

    const card = page.locator(".file-card");
    await expect(card.locator('[data-share="header"]')).toBeVisible({
      timeout: 10000,
    });

    const posted: TelemetryPayload[] = [];
    await page.route("**/ithmb-telemetry.ithmb-codec.workers.dev/**", async (route) => {
      if (route.request().method() === "POST") {
        posted.push(JSON.parse(route.request().postData() || "{}"));
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: '{"ok":true}',
      });
    });

    const headerBtn = card.locator('[data-share="header"]');
    await headerBtn.click();
    await expect.poll(() => posted.length, { timeout: 5000 }).toBe(1);
    const b0 = posted[0];
    if (!b0) throw new Error("no telemetry posted");
    expect(b0.full_file).toBeUndefined();

    // Full-file stays available after a header share
    const fullBtn = card.locator('[data-share="full"]');
    await expect(fullBtn).not.toBeDisabled();
    await fullBtn.click();
    await expect.poll(() => posted.length, { timeout: 5000 }).toBe(2);
    const first = posted[0];
    if (!first) throw new Error("no telemetry posted");
    const second = posted[1];
    if (!second) throw new Error("no telemetry posted");
    expect(typeof second.full_file).toBe("string");
    expect(Buffer.from(second.full_file, "base64").length).toBe(corruptBytes.length);
    expect(second.header).toBe(first.header);

    // Full file includes the header — both buttons now locked
    await expect(fullBtn).toHaveText("Shared ✓");
    await expect(fullBtn).toBeDisabled();
    await expect(headerBtn).toBeDisabled();
    await expect(headerBtn).toHaveAttribute("title", /Full file already shared/);
    fs.rmSync(corruptFile, { force: true });
  });
  test("dropzone shows hint text", async ({ page }) => {
    await page.goto("/ithmb-decoder/");
    const hint = page.locator("#dropzone .hint");
    await expect(hint).toContainText(/click|browse|drop/i);
  });

  test("server rejection shows honest failure toast, button stays active", async ({ page }) => {
    await page.goto("/ithmb-decoder/");
    const corruptFile = path.join(FIXTURES, "corrupt-reject.ithmb");
    fs.writeFileSync(
      corruptFile,
      fs.readFileSync(path.join(FIXTURES, "test1.ithmb")).subarray(0, 100),
    );
    const [fc] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.locator("#dropzone").click(),
    ]);
    await fc.setFiles([corruptFile]);

    const card = page.locator(".file-card");
    await expect(card.locator('[data-share="header"]')).toBeVisible({
      timeout: 10000,
    });

    const posted: TelemetryPayload[] = [];
    await page.route("**/ithmb-telemetry.ithmb-codec.workers.dev/**", async (route) => {
      if (route.request().method() === "POST") {
        posted.push(JSON.parse(route.request().postData() || "{}"));
      }
      // Simulate the worker rejecting the payload (e.g. invalid prefix)
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: '{"error":"invalid prefix"}',
      });
    });

    const headerBtn = card.locator('[data-share="header"]');
    await headerBtn.click();
    await expect(page.locator(".toast")).toContainText(/failed/i);
    // Honest feedback: no fake success, button stays clickable for retry
    await expect(headerBtn).toHaveText("Share 16 bytes");
    await expect(headerBtn).not.toBeDisabled();
    await expect.poll(() => posted.length, { timeout: 5000 }).toBe(1);
    fs.rmSync(corruptFile, { force: true });
  });
});

// ─── Quiet-by-default (no contribution UI) ───────────────────────────────────

test.describe("Quiet-by-default", () => {
  test("success card has no contribute button, shows report link", async ({ page }) => {
    await page.goto("/ithmb-decoder/");
    const [fc] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.locator("#dropzone").click(),
    ]);
    await fc.setFiles([path.join(FIXTURES, "test1.ithmb")]);

    const card = page.locator(".file-card");
    await expect(card.locator(".status")).not.toContainText("Decoding...", {
      timeout: 10000,
    });
    await expect(card.locator("[data-save]")).toBeVisible();
    await expect(card.locator("[data-contribute]")).toHaveCount(0);
    await expect(card).not.toContainText(/Contribute/);
    const reportLink = card.locator("[data-report]");
    await expect(reportLink).toBeVisible();
    await expect(reportLink).toHaveText(/Image looks wrong\?/);
  });

  test("report link shares first 16 bytes and marks shared", async ({ page }) => {
    await page.goto("/ithmb-decoder/");
    const [fc] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.locator("#dropzone").click(),
    ]);
    await fc.setFiles([path.join(FIXTURES, "test1.ithmb")]);

    const card = page.locator(".file-card");
    await expect(card.locator("[data-save]")).toBeVisible({ timeout: 10000 });

    const posted: TelemetryPayload[] = [];
    await page.route("**/ithmb-telemetry.ithmb-codec.workers.dev/**", async (route) => {
      if (route.request().method() === "POST") {
        posted.push(JSON.parse(route.request().postData() || "{}"));
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: '{"ok":true}',
      });
    });

    const reportLink = card.locator("[data-report]");
    await reportLink.click();
    // Clicking opens the SHARED report modal (no POST yet).
    const modal = page.locator("#reportModal");
    await expect(modal).toHaveClass(/active/);
    const form = modal.locator(".report-form");
    await expect(form).toBeVisible();
    await expect.poll(() => posted.length).toBe(0);
    // Select an issue + optional detail, then submit.
    await modal.locator(".report-issue input[value='color_space']").check();
    await modal.locator(".report-detail").fill("green tint on everything");
    await modal.locator(".report-form-actions .btn-primary").click();
    await expect(reportLink.first()).toHaveText("Thanks — shared ✓");
    await expect(page.locator(".toast")).toContainText(/shared/i);
  });

  test("no legacy batch toggle, footer bar, or contribute modal", async ({ page }) => {
    await page.goto("/ithmb-decoder/");
    await expect(page.locator("#batchShareCheck")).toHaveCount(0);
    await expect(page.locator(".batch-toggle")).toHaveCount(0);
    await expect(page.locator("#viewer-footer-bar")).toHaveCount(0);
    // The legacy contribute modal is gone; the report workflow now uses the
    // shared #reportModal (intentionally present, closed by default).
    await expect(page.locator("#contributeModal")).toHaveCount(0);
    await expect(page.locator("#reportModal")).toHaveCount(1);
    await expect(page.locator("#reportModal")).not.toHaveClass(/active/);
  });
});
// ─── Viewer contextual share/report (mirrors card actions) ────────────────

test.describe("Viewer contextual share/report", () => {
  test("viewer stage shows share box for a failed card", async ({ page }) => {
    const corruptFile = path.join(FIXTURES, "corrupt-viewer.ithmb");
    fs.writeFileSync(
      corruptFile,
      fs.readFileSync(path.join(FIXTURES, "test1.ithmb")).subarray(0, 100),
    );
    await page.goto("/ithmb-decoder/");
    const [fc] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.locator("#dropzone").click(),
    ]);
    await fc.setFiles([corruptFile]);

    const card = page.locator(".file-card");
    await expect(card.locator(".share-box")).toBeVisible({ timeout: 10000 });
    // Viewer auto-opens for the first batch — stage mirrors the card's share box
    await expect(page.locator("#viewer-stage .share-box")).toBeVisible();
    await expect(page.locator("#viewer-stage [data-share=header]")).toHaveText("Share 16 bytes");
    await expect(page.locator("#viewer-stage [data-share=full]")).toHaveText("Share full file");
    fs.rmSync(corruptFile, { force: true });
  });

  test("viewer stage report link posts header for a success card", async ({ page }) => {
    await page.goto("/ithmb-decoder/");
    const [fc] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.locator("#dropzone").click(),
    ]);
    await fc.setFiles([path.join(FIXTURES, "test1.ithmb")]);

    const card = page.locator(".file-card");
    await expect(card.locator("[data-save]")).toBeVisible({ timeout: 10000 });

    const posted: TelemetryPayload[] = [];
    await page.route("**/ithmb-telemetry.ithmb-codec.workers.dev/**", async (route) => {
      if (route.request().method() === "POST") {
        posted.push(JSON.parse(route.request().postData() || "{}"));
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: '{"ok":true}',
      });
    });

    const viewerLink = page.locator("#viewer-stage [data-report]");
    await expect(viewerLink).toBeVisible();
    await expect(viewerLink).toHaveText(/Image looks wrong\?/);
    await viewerLink.click();
    // Clicking opens the SHARED report modal (no POST yet).
    const modal = page.locator("#reportModal");
    await expect(modal).toHaveClass(/active/);
    const form = modal.locator(".report-form");
    await expect(form).toBeVisible();
    await expect.poll(() => posted.length).toBe(0);
    await modal.locator(".report-issue input[value='byte_order']").check();
    await modal.locator(".report-form-actions .btn-primary").click();
    await expect(viewerLink).toHaveText("Thanks — shared ✓");

    await expect.poll(() => posted.length, { timeout: 5000 }).toBe(1);
    const b0 = posted[0];
    if (!b0) throw new Error("no telemetry posted");
    expect(b0.header).toMatch(/^[0-9a-f]{32}$/);
    expect(b0.status).toBe("success");
    expect(b0.issue).toBe("byte_order");
  });
});
