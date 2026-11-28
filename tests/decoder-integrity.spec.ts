// Decoder data-integrity regression suite (MASTER-TRIAGE B3).
//
//   MT-003 / F1 / F4 — an unknown prefix must never be painted as a success
//                      through the codec's 256-byte size heuristic.
//   MT-004 / F2      — a multi-frame payload must render true frame 0 (the
//                      WASM RGB565/RGB555 stride bug otherwise corrupts rows).
//   MT-017 / F6      — dedupe must fingerprint the whole file, not 256 bytes.
//   F5 / F7          — no phantom prefix 1044, embedded JPEG is labelled JPEG,
//                      corrupt JPEG is "damaged" rather than "unknown".
//
// The frame-0 reference hashes in fixtures/decoder-integrity/manifest.json come
// from the Rust CLI decoding one extracted frame (see work/shots/decoder-integrity/).
import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { waitDecodeSettled, waitDecoderInit } from "./helpers";

const FIXTURES = path.join(__dirname, "fixtures", "decoder-integrity");
const BASE_FIXTURES = path.join(__dirname, "fixtures");

interface FixtureRef {
  file: string;
  size: number;
  sha256: string;
  frameStride?: number;
  frameCount?: number;
  cliFrame0?: { width: number; height: number; sha256_rgba: string };
  note?: string;
}

const manifest = JSON.parse(fs.readFileSync(path.join(FIXTURES, "manifest.json"), "utf8")) as {
  fixtures: FixtureRef[];
  jpegFixtures: FixtureRef[];
};

const fixture = (name: string): FixtureRef => {
  const found = manifest.fixtures.find((f) => f.file === name);
  if (!found) throw new Error(`fixture missing from manifest: ${name}`);
  return found;
};

const fixtureBytes = (name: string): Buffer => fs.readFileSync(path.join(FIXTURES, name));

async function waitSettled(page: Page, minCards = 1): Promise<void> {
  await waitDecodeSettled(page, minCards);
}

async function gotoDecoder(page: Page): Promise<void> {
  await page.goto("/ithmb-decoder/", { waitUntil: "domcontentloaded" });
  await waitDecoderInit(page);
}

interface CardCanvas {
  name: string;
  width: number;
  height: number;
  sha256_rgba: string | null;
}

/** SHA-256 of each card's canvas RGBA, computed in the page. */
async function cardCanvases(page: Page): Promise<CardCanvas[]> {
  return page.evaluate(async () => {
    const out: CardCanvas[] = [];
    for (const card of document.querySelectorAll(".file-card")) {
      const name = card.querySelector(".name")?.textContent ?? "";
      const canvas = card.querySelector<HTMLCanvasElement>(".preview canvas");
      if (!canvas) {
        out.push({ name, width: 0, height: 0, sha256_rgba: null });
        continue;
      }
      const ctx = canvas.getContext("2d")!;
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const digest = await crypto.subtle.digest("SHA-256", data);
      const hex = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      out.push({ name, width: canvas.width, height: canvas.height, sha256_rgba: hex });
    }
    return out;
  });
}

test.describe("MT-003 unknown-prefix false success", () => {
  test.beforeEach(async ({ page }) => {
    await gotoDecoder(page);
  });

  test("length-heuristic fixture is refused, not decoded", async ({ page }) => {
    // 0xDEADBEEF + 2520 bytes: the codec's size heuristic turns this into a
    // fabricated 42x30 "success"; the page must show the honest failure card.
    await page.setInputFiles("#fileInput", [
      {
        name: "unknown-prefix-lenmatch-2524.ithmb",
        mimeType: "application/octet-stream",
        buffer: fixtureBytes("unknown-prefix-lenmatch-2524.ithmb"),
      },
    ]);
    await waitSettled(page);

    const card = page.locator(".file-card").first();
    await expect(card).toHaveCount(1);
    await expect(card.locator(".status.unknown")).toBeVisible();
    await expect(card.locator(".status")).toContainText(/Unknown format: prefix 3735928559/);
    await expect(card.locator(".status")).not.toContainText(/Decoded/);
    // No image, no Save, no ZIP: a guessed decode must never be exportable.
    await expect(card.locator(".preview canvas")).toHaveCount(0);
    await expect(card.locator("[data-save]")).toHaveCount(0);
    await expect(page.locator("#downloadAllBtn")).not.toBeVisible();
  });

  test("length-heuristic fixture stays refused across fresh loads", async ({ page }) => {
    const file = {
      name: "unknown-prefix-lenmatch-2524.ithmb",
      mimeType: "application/octet-stream",
      buffer: fixtureBytes("unknown-prefix-lenmatch-2524.ithmb"),
    };
    for (let load = 0; load < 3; load++) {
      await gotoDecoder(page);
      await page.setInputFiles("#fileInput", [file]);
      await waitSettled(page);
      await expect(page.locator(".file-card .status")).toContainText(/Unknown format/);
      await expect(page.locator(".file-card .preview canvas")).toHaveCount(0);
    }
  });

  test("8192-byte heuristic fixture (profile 1066/3003 length) is refused", async ({ page }) => {
    const prefix = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
    const body = Buffer.alloc(8192, 0x5a);
    await page.setInputFiles("#fileInput", [
      {
        name: "unknown-prefix-8192.ithmb",
        mimeType: "application/octet-stream",
        buffer: Buffer.concat([prefix, body]),
      },
    ]);
    await waitSettled(page);
    await expect(page.locator(".file-card .status")).toContainText(/Unknown format/);
    await expect(page.locator(".file-card .preview canvas")).toHaveCount(0);
  });

  test("unknown prefix that cannot trigger the heuristic still uses the JPEG carve path", async ({
    page,
  }) => {
    await page.setInputFiles("#fileInput", [
      {
        name: "jpeg-carved-at-256.ithmb",
        mimeType: "application/octet-stream",
        buffer: fixtureBytes("jpeg-carved-at-256.ithmb"),
      },
    ]);
    await waitSettled(page);
    const card = page.locator(".file-card").first();
    await expect(card.locator(".status.ok")).toBeVisible();
    await expect(card.locator(".status")).toContainText(/Decoded: 64 × 48/);
    // A real (carved) JPEG is labelled as such, never "Unknown format".
    await expect(card.locator('[data-info="enc"] .info-value')).toHaveText("JPEG (embedded)");
  });
});

test.describe("MT-004 multi-frame corruption", () => {
  test.beforeEach(async ({ page }) => {
    await gotoDecoder(page);
  });

  const cases = [
    "multiframe-1055-prefixed.ithmb",
    "two-frames-1009.ithmb",
    "multiframe-uyvy-1019.ithmb",
    "multiframe-reordered-3001.ithmb",
  ];

  for (const name of cases) {
    const ref = fixture(name);
    const cli = ref.cliFrame0!;
    test(`${name}: frame 1 of ${ref.frameCount} matches the CLI frame-0 pixels`, async ({
      page,
    }) => {
      await page.setInputFiles("#fileInput", [
        { name, mimeType: "application/octet-stream", buffer: fixtureBytes(name) },
      ]);
      await waitSettled(page);

      const card = page.locator(".file-card").first();
      await expect(card.locator(".status.ok")).toBeVisible();
      // The visible status line names the frame that is painted (LB-06).
      await expect(card.locator(".status")).toContainText(
        new RegExp(`Decoded: ${cli.width} × ${cli.height} · frame 1 of ${ref.frameCount}`),
      );
      // The card admits what it is showing (not a silently corrupted image).
      await expect(card.locator('[data-info="frame"] .info-value')).toHaveText(
        `1 / ${ref.frameCount}`,
      );
      // Frame 0 pixels equal the Rust CLI reference exactly.
      const [canvas] = await cardCanvases(page);
      expect(canvas?.width).toBe(cli.width);
      expect(canvas?.height).toBe(cli.height);
      expect(canvas?.sha256_rgba).toBe(cli.sha256_rgba);
      // A correct frame 0 is exportable (Save + ZIP).
      await expect(card.locator("[data-save]")).toBeVisible();
      await expect(page.locator("#downloadAllBtn")).toBeVisible();
    });
  }

  test("truncated multi-frame file still renders true frame 0 and says the count is unknown", async ({
    page,
  }) => {
    const ref = fixture("multiframe-1055-prefixed.ithmb");
    const bytes = fixtureBytes("multiframe-1055-prefixed.ithmb");
    // prefix + frame 0 + 16000 bytes of frame 1 (truncated container).
    const truncated = bytes.subarray(0, 4 + ref.frameStride! + 16000);
    await page.setInputFiles("#fileInput", [
      {
        name: "multiframe-1055-truncated.ithmb",
        mimeType: "application/octet-stream",
        buffer: truncated,
      },
    ]);
    await waitSettled(page);
    const card = page.locator(".file-card").first();
    await expect(card.locator(".status.ok")).toBeVisible();
    await expect(card.locator(".status")).toContainText(/frame 1 of \?/);
    await expect(card.locator('[data-info="frame"] .info-value')).toHaveText("1 / ?");
    const [canvas] = await cardCanvases(page);
    expect(canvas?.sha256_rgba).toBe(ref.cliFrame0!.sha256_rgba);
  });

  test("single-frame file gets no frame row", async ({ page }) => {
    await page.setInputFiles("#fileInput", [
      {
        name: "test1.ithmb",
        mimeType: "application/octet-stream",
        buffer: fs.readFileSync(path.join(BASE_FIXTURES, "test1.ithmb")),
      },
    ]);
    await waitSettled(page);
    const card = page.locator(".file-card").first();
    await expect(card.locator(".status.ok")).toBeVisible();
    await expect(card.locator('[data-info="frame"]')).toHaveCount(0);
  });
});

test.describe("MT-017 duplicate detection", () => {
  test.beforeEach(async ({ page }) => {
    await gotoDecoder(page);
  });

  const base = () => fs.readFileSync(path.join(BASE_FIXTURES, "test1.ithmb"));

  test("identical name + identical content still dedupes to one card", async ({ page }) => {
    const buf = base();
    await page.setInputFiles("#fileInput", [
      { name: "photo.ithmb", mimeType: "application/octet-stream", buffer: buf },
      { name: "photo.ithmb", mimeType: "application/octet-stream", buffer: buf },
    ]);
    await waitSettled(page, 1);
    await expect(page.locator(".file-card")).toHaveCount(1);
    await expect(page.locator("#batchNotice")).toContainText(/1 duplicate/);
  });

  test("same name and same first 256 bytes but different content -> two cards", async ({
    page,
  }) => {
    const first = Buffer.from(base());
    const second = Buffer.from(base());
    second[1000] = second[1000]! ^ 0xff; // differ well past the old 256-byte sample
    expect(first.subarray(0, 256).equals(second.subarray(0, 256))).toBe(true);
    await page.setInputFiles("#fileInput", [
      { name: "photo.ithmb", mimeType: "application/octet-stream", buffer: first },
      { name: "photo.ithmb", mimeType: "application/octet-stream", buffer: second },
    ]);
    await waitSettled(page, 2);
    await expect(page.locator(".file-card")).toHaveCount(2);
    await expect(page.locator(".file-card .status.ok")).toHaveCount(2);
    await expect(page.locator("#batchNotice")).toBeHidden();
    // The two cards are genuinely different images (the byte that changed is a pixel).
    const canvases = await cardCanvases(page);
    expect(canvases).toHaveLength(2);
    expect(canvases[0]?.sha256_rgba).not.toBe(canvases[1]?.sha256_rgba);
  });
});

test.describe("F5/F7 labels", () => {
  test.beforeEach(async ({ page }) => {
    await gotoDecoder(page);
  });

  test("bare embedded JPEG succeeds and is labelled JPEG (embedded)", async ({ page }) => {
    await page.setInputFiles("#fileInput", [
      {
        name: "jpeg-bare.ithmb",
        mimeType: "application/octet-stream",
        buffer: fixtureBytes("jpeg-bare.ithmb"),
      },
    ]);
    await waitSettled(page);
    const card = page.locator(".file-card").first();
    await expect(card.locator(".status.ok")).toBeVisible();
    await expect(card.locator('[data-info="enc"] .info-value')).toHaveText("JPEG (embedded)");
    // No fake format number for a stream that has no codec profile.
    await expect(card.locator(".prefix-badge")).toHaveCount(0);
    await expect(card.locator(".status")).not.toContainText(/Unknown/);
    await expect(card.locator("[data-save]")).toBeVisible();
  });

  test("corrupt embedded JPEG is damaged, not unknown", async ({ page }) => {
    await page.setInputFiles("#fileInput", [
      {
        name: "jpeg-bomb-65535.ithmb",
        mimeType: "application/octet-stream",
        buffer: fixtureBytes("jpeg-bomb-65535.ithmb"),
      },
    ]);
    await waitSettled(page);
    const card = page.locator(".file-card").first();
    await expect(card.locator(".status.err")).toBeVisible();
    await expect(card.locator(".status")).toContainText(/damaged/i);
    await expect(card.locator(".status")).not.toContainText(/Unknown format/);
    await expect(card.locator(".failure-info__why")).toContainText(
      /empty, cut short, or its data is corrupted/i,
    );
  });

  test("prefix 1044 is unknown, not damaged (profile does not exist in the codec)", async ({
    page,
  }) => {
    const prefix = Buffer.from([0x00, 0x00, 0x04, 0x14]); // 1044
    await page.setInputFiles("#fileInput", [
      {
        name: "prefix-1044-unknown.ithmb",
        mimeType: "application/octet-stream",
        buffer: Buffer.concat([prefix, Buffer.alloc(96)]),
      },
    ]);
    await waitSettled(page);
    const card = page.locator(".file-card").first();
    await expect(card.locator(".status.unknown")).toBeVisible();
    await expect(card.locator(".status")).toContainText(/Unknown format: prefix 1044/);
    await expect(card.locator(".status")).not.toContainText(/damaged/i);
  });
});
