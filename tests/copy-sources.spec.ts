// Tier B1 copy-source rule: static pages carry their copy inline; the decoder
// is the only locale-driven surface. Guards against reintroducing two sources.
// The limits numbers and the format list are generated from one registry each
// (limits.ts / formats.ts); these checks keep the hand-written copy in step.
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { OUTPUT_FORMATS } from "../ithmb-decoder/formats";
import { LIMIT_VALUES } from "../ithmb-decoder/limits";

const ROOT = path.join(__dirname, "..");

/** Interpolate a locale template the same way t() does (no HTML escaping needed). */
function fill(template: string, params: Record<string, string | number>): string {
  let out = template;
  for (const [key, value] of Object.entries(params)) {
    out = out.split("{" + key + "}").join(String(value));
  }
  return out;
}

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const STATIC_PAGES = [
  "index.html",
  "zh/index.html",
  "guide/how-to-open-ithmb-files.html",
  "zh/guide/how-to-open-ithmb-files.html",
  "privacy/index.html",
  "zh/privacy/index.html",
  "404.html",
  "zh/404.html",
];

test.describe("Copy sources", () => {
  test("static pages keep their copy inline (no i18n hooks)", () => {
    for (const page of STATIC_PAGES) {
      const html = fs.readFileSync(path.join(ROOT, page), "utf8");
      // The build-time nav/footer shell is generated localized markup (shared
      // runtime attributes, rendered per locale); page copy itself must stay
      // inline in the HTML.
      const pageOnly = html
        .replace(/<!-- shell:nav:start -->[\s\S]*?<!-- shell:nav:end -->/, "")
        .replace(/<!-- shell:footer:start -->[\s\S]*?<!-- shell:footer:end -->/, "");
      expect(pageOnly, `${page} must not depend on locale JSON`).not.toMatch(/data-i18n/);
    }
  });

  test("the decoder stays locale-driven", () => {
    for (const page of ["ithmb-decoder/index.html", "zh/ithmb-decoder/index.html"]) {
      const html = fs.readFileSync(path.join(ROOT, page), "utf8");
      expect(html, `${page} renders runtime copy from locales`).toMatch(/data-i18n/);
    }
  });

  test("locale keys are limited to the decoder/runtime prefixes", () => {
    const allowed = new Set(["nav", "app", "viewer", "card", "ui", "decoder", "a11y", "failure"]);
    for (const locale of ["en.json", "zh.json"]) {
      const keys = Object.keys(
        JSON.parse(fs.readFileSync(path.join(ROOT, "ithmb-decoder/locales", locale), "utf8")),
      );
      for (const key of keys) {
        expect(allowed, `${locale}: ${key}`).toContain(key.split(".")[0]);
      }
    }
  });

  test("limits copy is generated from the one LIMITS source (CH-11)", () => {
    const en = JSON.parse(read("ithmb-decoder/locales/en.json")) as Record<string, string>;
    const zh = JSON.parse(read("ithmb-decoder/locales/zh.json")) as Record<string, string>;
    const { fileMb, sessionFiles, sessionMb, zipMb } = LIMIT_VALUES;

    // Runtime copy: the locale templates interpolate LIMITS and reproduce the
    // shipped wording exactly (the refactor must not change user-visible text).
    expect(fill(en["app.help"] ?? "", LIMIT_VALUES)).toBe(
      `Limits: ${fileMb} MB per file, ${sessionFiles} files and ${sessionMb} MB per session. ` +
        `A ZIP over ${zipMb} MB asks for confirmation. ` +
        "Shortcuts: ← → arrows navigate, hold to repeat.",
    );
    expect(fill(en["ui.summaryTooLarge"] ?? "", { n: 3, mb: fileMb })).toBe(`3 over ${fileMb} MB`);
    expect(fill(zh["app.help"] ?? "", LIMIT_VALUES)).toBe(
      `限制：单个文件最大 ${fileMb} MB，单次最多 ${sessionFiles} 个文件、合计 ${sessionMb} MB。` +
        `生成的 ZIP 超过 ${zipMb} MB 时会先请你确认。` +
        "快捷键：← → 切换图片，按住方向键可连续切换。",
    );
    expect(fill(zh["ui.summaryTooLarge"] ?? "", { n: 3, mb: fileMb })).toBe(
      `3 个文件超过 ${fileMb} MB`,
    );

    // No hand-written cap survives in the locale tables: the values are
    // placeholders filled from LIMITS.
    for (const table of [en, zh]) {
      for (const value of Object.values(table)) {
        expect(value).not.toMatch(/\b(?:8|100|256) MB\b/);
        expect(value).not.toMatch(/\b200 files\b/);
      }
    }

    // Static pages quote the same numbers. Their wording is authored, so this
    // is a drift check (not a generator): change LIMITS and these fail until
    // the copy is updated.
    const guideEn = read("guide/how-to-open-ithmb-files.html");
    expect(guideEn).toContain(
      `In the browser, each file must be ${fileMb} MB or smaller. ` +
        `A session is limited to ${sessionFiles} files and ${sessionMb} MB. ` +
        `A ZIP over ${zipMb} MB asks for confirmation.`,
    );
    expect(guideEn).toContain(
      `Limits: ${fileMb} MB per file and a session of ${sessionFiles} files and ${sessionMb} MB. ` +
        `A ZIP over ${zipMb} MB asks for confirmation.`,
    );
    const guideZh = read("zh/guide/how-to-open-ithmb-files.html");
    expect(guideZh).toContain(
      `单次最多 ${sessionFiles} 个文件、合计 ${sessionMb} MB。` +
        `生成的 ZIP 超过 ${zipMb} MB 时会先请你确认。`,
    );
    expect(read("ithmb-decoder/index.html")).toContain(
      `Up to ${fileMb} MB per file · ${sessionFiles} files and ${sessionMb} MB per session · ` +
        `ZIPs over ${zipMb} MB ask first`,
    );
    expect(read("zh/ithmb-decoder/index.html")).toContain(
      `单个文件最大 ${fileMb} MB · 单次最多 ${sessionFiles} 个文件、合计 ${sessionMb} MB · ` +
        `生成的 ZIP 超过 ${zipMb} MB 时会先请你确认`,
    );
  });

  test("format controls follow the one formats registry (CH-11)", () => {
    const mimes = OUTPUT_FORMATS.map((format) => format.mime);
    const labels = OUTPUT_FORMATS.map((format) => format.label);
    for (const page of ["ithmb-decoder/index.html", "zh/ithmb-decoder/index.html"]) {
      const html = read(page);
      const buttons = [
        ...html.matchAll(/<button[^>]*\bdata-format="([^"]+)"[^>]*>([^<]+)<\/button>/g),
      ];
      expect(
        buttons.map((m) => m[1]),
        `${page}: segmented order`,
      ).toEqual(mimes);
      expect(
        buttons.map((m) => m[2]),
        `${page}: segmented labels`,
      ).toEqual(labels);
      const select = html.match(/<select id="downloadFormatSelect"[\s\S]*?<\/select>/)?.[0] ?? "";
      const options = [...select.matchAll(/<option value="([^"]+)"[^>]*>([^<]+)<\/option>/g)];
      expect(
        options.map((m) => m[1]),
        `${page}: select order`,
      ).toEqual(mimes);
      expect(
        options.map((m) => m[2]),
        `${page}: select labels`,
      ).toEqual(labels);
    }
  });
});
