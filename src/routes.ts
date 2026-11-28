// routes.ts — the single source of truth for the site's page registry.
//
// One entry per page owns everything that used to be copied across authored
// maps: the canonical EN/ZH URLs, the authored HTML file for each locale, the
// sitemap priority, the alternate URL forms the language switcher resolves,
// the alias forms the host 301s, and whether the EN 404 page should remap a
// page's links to its ZH canonical. Consumers derive from here:
//   - scripts/build.mts   sitemap.xml, _redirects, static-shell page paths
//   - shell.ts            nav + footer page links
//   - ithmb-decoder/failure-info.ts (via i18n.ts)  guide / privacy hrefs
//   - 404-lang.ts         ZH link remaps on the 404 page
//   - tests/routes.spec.ts  every canonical page has an alias + sitemap pair
//
// Build note: build.mts bundles the root IIFE entries and i18n.ts (both
// bundle: true), so this module is inlined at build time and adds no request.
// The decoder's per-module build never emits it as a separate public file.

/** Site locales. The page registry always carries both. */
export type Locale = "en" | "zh";

/** Stable page identifier used by nav/footer/404/redirect consumers. */
export type RouteKey = "home" | "decoder" | "guide" | "privacy" | "notices" | "notFound";

/** Sitemap priority per locale. */
export interface SitemapPriority {
  en: string;
  zh: string;
}

export interface RoutePair {
  /** Stable key: consumers ask for a page by key, never by literal path. */
  key: RouteKey;
  /** Canonical English path. */
  en: string;
  /** Canonical Chinese path. */
  zh: string;
  /** Authored HTML file per locale (sitemap source / static shell input). */
  html: { en: string; zh: string };
  /** Sitemap priority per locale; null keeps the page out of the sitemap. */
  sitemap: SitemapPriority | null;
  /** Alternate English URL forms the language switcher resolves. */
  enAliases?: readonly string[];
  /** Alternate Chinese URL forms the language switcher resolves. */
  zhAliases?: readonly string[];
  /**
   * Alias forms above that the host must 301 to the canonical page. Only the
   * forms a static host does not already normalise belong here (the
   * .html / index.html spellings); each entry must also be listed as an alias.
   */
  redirects?: { en?: readonly string[]; zh?: readonly string[] };
  /** Remap this page's EN links to its ZH canonical on the EN 404 page. */
  remapOn404?: boolean;
}

export const ROUTES: readonly RoutePair[] = [
  {
    key: "home",
    en: "/",
    zh: "/zh/",
    html: { en: "index.html", zh: "zh/index.html" },
    sitemap: { en: "1.0", zh: "0.8" },
    enAliases: ["/index.html"],
    zhAliases: ["/zh/index.html"],
    redirects: { en: ["/index.html"], zh: ["/zh/index.html"] },
    remapOn404: true,
  },
  {
    key: "decoder",
    en: "/ithmb-decoder/",
    zh: "/zh/ithmb-decoder/",
    html: { en: "ithmb-decoder/index.html", zh: "zh/ithmb-decoder/index.html" },
    sitemap: { en: "0.9", zh: "0.7" },
    enAliases: ["/ithmb-decoder", "/ithmb-decoder/index.html"],
    zhAliases: ["/zh/ithmb-decoder/index.html"],
    redirects: {
      en: ["/ithmb-decoder/index.html"],
      zh: ["/zh/ithmb-decoder/index.html"],
    },
    remapOn404: true,
  },
  {
    key: "guide",
    en: "/guide/how-to-open-ithmb-files",
    zh: "/zh/guide/how-to-open-ithmb-files",
    html: {
      en: "guide/how-to-open-ithmb-files.html",
      zh: "zh/guide/how-to-open-ithmb-files.html",
    },
    sitemap: { en: "0.8", zh: "0.7" },
    enAliases: ["/guide", "/guide/", "/guide/how-to-open-ithmb-files.html"],
    zhAliases: ["/zh/guide/how-to-open-ithmb-files.html"],
    redirects: {
      en: ["/guide", "/guide/", "/guide/how-to-open-ithmb-files.html"],
      zh: ["/zh/guide/how-to-open-ithmb-files.html"],
    },
    remapOn404: true,
  },
  {
    key: "privacy",
    en: "/privacy/",
    zh: "/zh/privacy/",
    html: { en: "privacy/index.html", zh: "zh/privacy/index.html" },
    sitemap: { en: "0.6", zh: "0.5" },
    enAliases: ["/privacy", "/privacy/index.html"],
    zhAliases: ["/zh/privacy/index.html"],
    remapOn404: true,
  },
  {
    key: "notices",
    en: "/third-party-notices",
    zh: "/zh/third-party-notices",
    html: {
      en: "third-party-notices.html",
      zh: "zh/third-party-notices.html",
    },
    sitemap: { en: "0.3", zh: "0.2" },
    enAliases: ["/third-party-notices.html"],
    zhAliases: ["/zh/third-party-notices.html"],
    redirects: {
      en: ["/third-party-notices.html"],
      zh: ["/zh/third-party-notices.html"],
    },
  },
  {
    key: "notFound",
    en: "/404.html",
    zh: "/zh/404.html",
    html: { en: "404.html", zh: "zh/404.html" },
    sitemap: null,
    enAliases: ["/404", "/404/"],
    zhAliases: ["/zh/404", "/zh/404/"],
  },
];

const ROUTE_BY_KEY = new Map<RouteKey, RoutePair>(
  ROUTES.map((route): [RouteKey, RoutePair] => [route.key, route]),
);

/** Registry lookup; a typo in a key fails loudly instead of producing "/". */
export function routeByKey(key: RouteKey): RoutePair {
  const route = ROUTE_BY_KEY.get(key);
  if (!route) throw new Error("routes: unknown page key " + key);
  return route;
}

/** Canonical path of a page in one locale. */
export function pagePath(key: RouteKey, locale: Locale): string {
  const route = routeByKey(key);
  return locale === "en" ? route.en : route.zh;
}

/** A served-path lookup for a registered page file. */
export interface HtmlPage {
  key: RouteKey;
  locale: Locale;
  /** Canonical path the file is served at. */
  path: string;
}

/**
 * Page identity of an authored HTML file (registry order, both locales).
 * Returns null for HTML the registry does not own, so callers can fall back
 * defensively instead of throwing mid-build.
 */
export function htmlPage(rel: string): HtmlPage | null {
  const normalized = rel.split("\\").join("/");
  for (const route of ROUTES) {
    for (const locale of ["en", "zh"] as const) {
      if (route.html[locale] === normalized) {
        return {
          key: route.key,
          locale,
          path: locale === "en" ? route.en : route.zh,
        };
      }
    }
  }
  return null;
}

/**
 * Redirect target: a literal URL, or a registered page (+ optional suffix
 * appended verbatim, e.g. the wildcard capture ":splat").
 */
export type RedirectTarget = string | { key: RouteKey; locale: Locale; suffix?: string };

export interface RedirectRule {
  from: string;
  to: RedirectTarget;
}

export interface RedirectGroup {
  comment: string;
  rules: readonly RedirectRule[];
}

/**
 * Redirects that are not alias spellings of a registered page: legacy paths
 * kept so old links and search results keep working. The per-page alias
 * redirects are derived from each route's `redirects` field; build.mts renders
 * both sets into `_redirects` (the one place the host rules live).
 */
export const LEGACY_REDIRECT_GROUPS: readonly RedirectGroup[] = [
  {
    comment: "Legacy decoder path → new decoder path (GSC 404 fix)",
    rules: [
      { from: "/wasm-decoder/*", to: { key: "decoder", locale: "en", suffix: ":splat" } },
      { from: "/zh/wasm-decoder/*", to: { key: "decoder", locale: "zh", suffix: ":splat" } },
    ],
  },
  {
    comment: "Guide aliases and legacy paths",
    rules: [
      { from: "/zh/guide", to: { key: "guide", locale: "zh" } },
      { from: "/zh/guide/", to: { key: "guide", locale: "zh" } },
      { from: "/wasm-decoder", to: { key: "decoder", locale: "en" } },
      { from: "/zh/wasm-decoder", to: { key: "decoder", locale: "zh" } },
    ],
  },
  {
    comment: "Removed Enterprise page → home (never offered as a product)",
    rules: [],
  },
];

/** Resolve a redirect target against the registry. */
export function redirectTarget(target: RedirectTarget): string {
  if (typeof target === "string") return target;
  return pagePath(target.key, target.locale) + (target.suffix ?? "");
}

function buildZhPages(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const route of ROUTES) {
    map[route.en] = route.zh;
    for (const alias of route.enAliases ?? []) map[alias] = route.zh;
  }
  return map;
}

function buildEnPages(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const route of ROUTES) {
    map[route.zh] = route.en;
    for (const alias of route.zhAliases ?? []) map[alias] = route.en;
  }
  return map;
}

/** Every EN URL form -> canonical ZH path. */
export const zhPages: Readonly<Record<string, string>> = buildZhPages();
/** Every ZH URL form -> canonical EN path. */
export const enPages: Readonly<Record<string, string>> = buildEnPages();

/**
 * Language counterpart of a path. Falls back to the language home page for
 * paths that are not part of the route map, matching the switcher's previous
 * behaviour.
 */
export function counterpart(path: string, isZh: boolean): string {
  if (isZh) return enPages[path] ?? "/";
  return zhPages[path] ?? "/zh/";
}
