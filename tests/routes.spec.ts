// Tier A2 — the shared route map must resolve both directions for every page
// form, and /zh/ must never map to the 404 page. The registry also owns the
// HTML sources, sitemap priorities and alias redirects, so this spec keeps
// those derivations honest (CH-06).
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  LEGACY_REDIRECT_GROUPS,
  ROUTES,
  counterpart,
  enPages,
  pagePath,
  routeByKey,
  zhPages,
} from "../src/routes";

const ROOT = path.join(__dirname, "..");
const ORIGIN = "https://ithmb-codec.dev";

test.describe("shared routes: EN <-> ZH counterparts", () => {
  test("every route resolves both directions (canonical)", () => {
    for (const route of ROUTES) {
      expect.soft(counterpart(route.en, false), `EN ${route.en}`).toBe(route.zh);
      expect.soft(counterpart(route.zh, true), `ZH ${route.zh}`).toBe(route.en);
    }
  });

  test("every alias resolves to the canonical counterpart", () => {
    for (const route of ROUTES) {
      for (const alias of route.enAliases ?? []) {
        expect.soft(counterpart(alias, false), `EN alias ${alias}`).toBe(route.zh);
      }
      for (const alias of route.zhAliases ?? []) {
        expect.soft(counterpart(alias, true), `ZH alias ${alias}`).toBe(route.en);
      }
    }
  });

  test("route map covers every page form (canonical + extensionless + index.html)", () => {
    const enForms = [
      "/",
      "/index.html",
      "/ithmb-decoder",
      "/ithmb-decoder/",
      "/ithmb-decoder/index.html",
      "/guide",
      "/guide/",
      "/guide/how-to-open-ithmb-files",
      "/guide/how-to-open-ithmb-files.html",
      "/privacy",
      "/privacy/",
      "/privacy/index.html",
      "/third-party-notices",
      "/third-party-notices.html",
      "/404",
      "/404/",
      "/404.html",
    ];
    const zhForms = [
      "/zh/",
      "/zh/index.html",
      "/zh/ithmb-decoder/",
      "/zh/ithmb-decoder/index.html",
      "/zh/guide/how-to-open-ithmb-files",
      "/zh/guide/how-to-open-ithmb-files.html",
      "/zh/privacy/",
      "/zh/privacy/index.html",
      "/zh/third-party-notices",
      "/zh/third-party-notices.html",
      "/zh/404",
      "/zh/404/",
      "/zh/404.html",
    ];
    for (const form of enForms) expect.soft(zhPages, `EN form ${form}`).toHaveProperty([form]);
    for (const form of zhForms) expect.soft(enPages, `ZH form ${form}`).toHaveProperty([form]);
  });

  test("targets stay inside the map (no dangling counterparts)", () => {
    for (const [form, zh] of Object.entries(zhPages)) {
      expect.soft(enPages, `ZH target for ${form}`).toHaveProperty([zh]);
    }
    for (const [form, en] of Object.entries(enPages)) {
      expect.soft(zhPages, `EN target for ${form}`).toHaveProperty([en]);
    }
  });

  test("a /zh/ page never maps to the 404 page", () => {
    expect(counterpart("/zh/", true)).toBe("/");
    expect(enPages["/zh/"]).toBe("/");
    expect(enPages["/zh/index.html"]).toBe("/");
    for (const [form, target] of Object.entries(enPages)) {
      if (form === "/zh/404.html" || form === "/zh/404" || form === "/zh/404/") continue;
      expect.soft(target, `${form} -> ${target}`).not.toBe("/404.html");
    }
    // The 404 pair itself stays canonical and symmetric.
    expect(zhPages["/404.html"]).toBe("/zh/404.html");
    expect(enPages["/zh/404.html"]).toBe("/404.html");
  });

  test("unknown paths fall back to the language home page", () => {
    expect(counterpart("/no-such-page", false)).toBe("/zh/");
    expect(counterpart("/zh/no-such-page", true)).toBe("/");
  });
});

test.describe("page registry: canonical pages, aliases and sitemap", () => {
  test("every registered page has an HTML source and alias forms", () => {
    for (const route of ROUTES) {
      for (const locale of ["en", "zh"] as const) {
        const source = route.html[locale];
        expect(source, `${route.key} ${locale}: html source`).toBeTruthy();
        expect(fs.existsSync(path.join(ROOT, source)), source).toBe(true);
        if (route.sitemap !== null) {
          expect(route.sitemap[locale], `${route.key} ${locale}: priority`).toMatch(/^\d\.\d$/);
        }
      }
      expect(route.enAliases?.length ?? 0, `${route.key}: EN alias form`).toBeGreaterThan(0);
      expect(route.zhAliases?.length ?? 0, `${route.key}: ZH alias form`).toBeGreaterThan(0);
      // An alias redirect must point at a form the switcher already resolves;
      // otherwise it is a legacy path and belongs in LEGACY_REDIRECT_GROUPS.
      for (const locale of ["en", "zh"] as const) {
        const aliases = locale === "en" ? route.enAliases : route.zhAliases;
        for (const from of route.redirects?.[locale] ?? []) {
          expect(aliases, `${route.key}: redirect ${from} is an alias`).toContain(from);
        }
      }
    }
  });

  test("every canonical page appears in the sitemap pair (404 is excluded)", () => {
    const xml = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
    const locs = new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1] ?? ""));
    expect(locs.size).toBe(10);
    for (const route of ROUTES) {
      for (const locale of ["en", "zh"] as const) {
        const canonical = locale === "en" ? route.en : route.zh;
        if (route.sitemap === null) {
          expect(locs.has(ORIGIN + canonical), `${canonical}: excluded from sitemap`).toBe(false);
          continue;
        }
        expect(locs.has(ORIGIN + canonical), `${canonical}: sitemap pair`).toBe(true);
        // The pair shares one canonical EN URL for hreflang/x-default.
        expect(xml).toContain(`hreflang="en" href="${ORIGIN}${route.en}"`);
        expect(xml).toContain(`hreflang="zh" href="${ORIGIN}${route.zh}"`);
      }
    }
  });

  test("_redirects is derived from the registry (no hand-written host rules)", () => {
    const lines = new Set(
      fs
        .readFileSync(path.join(ROOT, "_redirects"), "utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#")),
    );
    // Every page-alias redirect the registry declares is in the host table.
    for (const route of ROUTES) {
      for (const locale of ["en", "zh"] as const) {
        const to = pagePath(route.key, locale);
        for (const from of route.redirects?.[locale] ?? []) {
          expect(lines.has(`${from} ${to} 301`), `${from} -> ${to}`).toBe(true);
        }
      }
    }
    // Every legacy/wildcard redirect is rendered from the registry too.
    for (const group of LEGACY_REDIRECT_GROUPS) {
      for (const rule of group.rules) {
        const target =
          typeof rule.to === "string"
            ? rule.to
            : pagePath(rule.to.key, rule.to.locale) + (rule.to.suffix ?? "");
        expect(lines.has(`${rule.from} ${target} 301`), `${rule.from} -> ${target}`).toBe(true);
      }
    }
    // Every canonical page is reachable through an alias/redirect form, and
    // every redirect destination is a registered canonical page (or the www
    // host rule, which is not a page).
    const canonicalPaths = new Set(ROUTES.flatMap((route) => [route.en, route.zh]));
    const redirectTargets = [...lines].map((line) => line.split(" ")[1] ?? "");
    for (const target of redirectTargets) {
      // Wildcard rules append the host's ":splat" capture to a canonical path.
      const pageTarget = target.endsWith(":splat") ? target.slice(0, -":splat".length) : target;
      if (pageTarget.startsWith("https://")) continue;
      expect(canonicalPaths.has(pageTarget), `redirect target ${target}`).toBe(true);
    }
    for (const route of ROUTES) {
      for (const locale of ["en", "zh"] as const) {
        const alias = locale === "en" ? route.enAliases : route.zhAliases;
        const froms = route.redirects?.[locale] ?? [];
        expect(
          (alias?.length ?? 0) + froms.length,
          `${pagePath(route.key, locale)}: redirect/alias`,
        ).toBeGreaterThan(0);
      }
    }
  });

  test("registry lookups fail loudly for unknown pages", () => {
    expect(pagePath("guide", "en")).toBe("/guide/how-to-open-ithmb-files");
    expect(routeByKey("notices").en).toBe("/third-party-notices");
    expect(() => routeByKey("nope" as never)).toThrow(/unknown page key/);
  });
});
