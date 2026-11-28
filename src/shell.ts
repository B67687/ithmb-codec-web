// shell.ts — shared, DOM-free renderers for the static site shell.
//
// The nav and footer are rendered into every page at build time (so crawlers
// and no-JS users get the full link set), and the classic scripts
// (nav.ts / footer.ts) then BIND to that markup as progressive enhancement.
// Both the build and the runtime fallback call these same functions, so the
// markup can never drift between the two paths.
import { pathnameLocale } from "../ithmb-decoder/locale.js";
import { counterpart, pagePath, routeByKey, type RouteKey } from "./routes.js";

type NavSection = "home" | "decoder" | "guide";

const SHELL_NAV_START = "<!-- shell:nav:start -->";
const SHELL_NAV_END = "<!-- shell:nav:end -->";
const SHELL_FOOTER_START = "<!-- shell:footer:start -->";
const SHELL_FOOTER_END = "<!-- shell:footer:end -->";

// Section membership derives from the route registry: the decoder/guide nav
// items match every URL under their canonical prefix, and home matches the
// canonical path plus its alias forms.
const HOME_FORMS = new Set<string>([
  pagePath("home", "en"),
  ...(routeByKey("home").enAliases ?? []),
]);
const DECODER_PREFIX = pagePath("decoder", "en").replace(/\/$/, "");
const GUIDE_PREFIX = "/" + pagePath("guide", "en").split("/")[1];

/**
 * Active nav section for a pathname (canonical and alias URLs). Pages without
 * a nav item (privacy, 404) return null: no link gets aria-current="page".
 */
export function activeSection(path: string): NavSection | null {
  const p = pathnameLocale(path) === "zh" ? path.replace(/^\/zh/, "") : path;
  if (p.startsWith(DECODER_PREFIX)) return "decoder";
  if (p.startsWith(GUIDE_PREFIX)) return "guide";
  if (HOME_FORMS.has(p) || p === "") return "home";
  return null;
}

// Link targets come from the route registry (canonical EN path); the ZH side
// is resolved through counterpart() so a nav/footer link can never drift from
// routes.ts.
const NAV_LINKS = [
  { id: "home", href: pagePath("home", "en"), text: "Home", zhText: "首页", i18n: "nav.home" },
  {
    id: "decoder",
    href: pagePath("decoder", "en"),
    text: "Decoder",
    zhText: "解码器",
    i18n: "nav.decoder",
  },
  {
    id: "guide",
    href: pagePath("guide", "en"),
    text: "Guide",
    zhText: "指南",
    i18n: "nav.guide",
  },
] as const;

const GH_SVG =
  '<svg viewBox="0 0 16 16" fill="currentColor" width="17" height="17" aria-hidden="true">' +
  '<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>' +
  "</svg>";

const CUP_SVG =
  '<svg class="site-footer__cup" viewBox="0 0 35 50" width="10" height="14"' +
  ' fill="currentColor" aria-hidden="true"' +
  ' style="vertical-align:-2px;margin-right:6px">' +
  '<path d="M18.3715 23.0976C16.5857 23.8665 14.5591 24.7382 11.9326 24.7382C10.8339 24.736 9.74049 24.5844 8.68213 24.2875L10.4987 43.0444C10.563 43.8284 10.9181 44.5594 11.4935 45.0923C12.0689 45.6251 12.8225 45.9208 13.6047 45.9207C13.6047 45.9207 16.1804 46.0552 17.0398 46.0552C17.9648 46.0552 20.7385 45.9207 20.7385 45.9207C21.5205 45.9207 22.274 45.6249 22.8493 45.092C23.4245 44.5592 23.7795 43.8283 23.8438 43.0444L25.7895 22.3173C24.92 22.0187 24.0425 21.8203 23.0533 21.8203C21.3424 21.8196 19.964 22.4122 18.3715 23.0976Z"/>' +
  '<path d="M34.1896 13.3639L33.916 11.9762C33.6706 10.7312 33.1134 9.55468 31.8426 9.10468C31.4353 8.96073 30.9732 8.89885 30.6608 8.60086C30.3485 8.30288 30.2562 7.84009 30.1839 7.41094C30.0502 6.62326 29.9244 5.83492 29.7873 5.04859C29.6689 4.37257 29.5753 3.61315 29.267 2.99296C28.8657 2.16022 28.033 1.67322 27.205 1.35102C26.7807 1.19173 26.3477 1.05698 25.9081 0.947426C23.8394 0.398542 21.6644 0.196746 19.5362 0.0817228C16.9817-0.0600379 14.4204-0.0173274 11.872 0.209526C9.97525 0.383071 7.97745 0.592939 6.17495 1.25281C5.51616 1.49429 4.8373 1.7842 4.33634 2.29609C3.72169 2.92502 3.52104 3.89768 3.96982 4.68199C4.28886 5.23895 4.82927 5.63245 5.40246 5.89276C6.14906 6.22818 6.92877 6.48341 7.72865 6.65421C9.95585 7.14928 12.2626 7.34368 14.538 7.42641C17.0599 7.52878 19.5859 7.44582 22.0958 7.1782C22.7165 7.10959 23.336 7.0273 23.9545 6.93134C24.6828 6.81901 25.1503 5.86115 24.9356 5.19388C24.6788 4.39611 23.9886 4.08669 23.208 4.2071C23.093 4.22526 22.9786 4.24208 22.8636 4.25889L22.7807 4.271C22.5163 4.30463 22.2518 4.33602 21.9874 4.36517C21.4412 4.42437 20.8937 4.4728 20.3448 4.51046C19.1155 4.59656 17.8828 4.63625 16.6508 4.63827C15.4403 4.63827 14.229 4.60396 13.0211 4.52392C12.47 4.48759 11.9202 4.4414 11.3718 4.38535C11.1223 4.35912 10.8735 4.33154 10.6247 4.3006L10.3879 4.27033L10.3364 4.26293L10.091 4.22728C9.58933 4.15127 9.08771 4.06382 8.59144 3.95822C8.54136 3.94704 8.49657 3.91902 8.46446 3.87879C8.43236 3.83855 8.41486 3.7885 8.41486 3.73691C8.41486 3.68533 8.43236 3.63528 8.46446 3.59504C8.49657 3.55481 8.54136 3.52679 8.59144 3.51561H8.6008C9.03086 3.42346 9.46426 3.34476 9.899 3.27615C10.0439 3.25328 10.1893 3.23086 10.3351 3.20888H10.3391C10.6113 3.19072 10.8849 3.14162 11.1557 3.10933C13.5125 2.86279 15.8832 2.77874 18.2513 2.85776C19.4011 2.89139 20.5501 2.95933 21.6945 3.07637C21.9406 3.10193 22.1854 3.12884 22.4302 3.15911C22.5238 3.17054 22.6181 3.18399 22.7124 3.19543L22.9024 3.22301C23.4562 3.30597 24.0071 3.40664 24.5551 3.52503C25.367 3.70261 26.4097 3.76046 26.7709 4.65508C26.8859 4.93894 26.9381 5.25442 27.0016 5.5524L27.0826 5.93245C27.0847 5.93927 27.0863 5.94624 27.0873 5.9533C27.2785 6.85017 27.4701 7.74704 27.6618 8.64391C27.6758 8.71017 27.6762 8.77862 27.6628 8.84501C27.6493 8.9114 27.6225 8.97429 27.5838 9.02977C27.5451 9.08525 27.4955 9.13212 27.4381 9.16746C27.3806 9.2028 27.3165 9.22585 27.2498 9.23517H27.2444L27.1274 9.25132L27.0117 9.26679C26.6452 9.31477 26.2782 9.35961 25.9108 9.40132C25.1871 9.48428 24.4623 9.55603 23.7364 9.61657C22.294 9.7372 20.8486 9.81635 19.4004 9.85401C18.6625 9.87374 17.9247 9.88294 17.1872 9.88159C14.2517 9.87926 11.3188 9.70768 8.40283 9.36769C8.08714 9.33002 7.77145 9.28966 7.45577 9.24863C7.70056 9.28024 7.27786 9.22441 7.19225 9.2123C6.9916 9.18405 6.79095 9.15468 6.5903 9.12419C5.91679 9.02262 5.24729 8.8975 4.57511 8.78786C3.76249 8.65333 2.98531 8.72059 2.25026 9.12419C1.6469 9.45624 1.15857 9.96544 0.850401 10.5838C0.533376 11.243 0.439071 11.9608 0.297279 12.6691C0.155487 13.3774-0.0652275 14.1395 0.0183763 14.8666C0.198292 16.4359 1.28915 17.7113 2.85823 17.9965C4.33434 18.2655 5.81847 18.4835 7.30662 18.6691C13.1524 19.3892 19.0582 19.4753 24.9223 18.9261C25.3998 18.8812 25.8767 18.8324 26.3529 18.7794C26.5016 18.763 26.6521 18.7802 26.7934 18.8299C26.9347 18.8795 27.0631 18.9603 27.1693 19.0663C27.2755 19.1724 27.3567 19.3009 27.4071 19.4426C27.4575 19.5843 27.4757 19.7356 27.4605 19.8853L27.312 21.3369C27.0128 24.2701 26.7136 27.2031 26.4144 30.1358C26.1023 33.2157 25.7882 36.2953 25.472 39.3747C25.3829 40.242 25.2937 41.109 25.2045 41.9758C25.1189 42.8294 25.1069 43.7099 24.9457 44.5534C24.6915 45.8799 23.7986 46.6945 22.4957 46.9925C21.3021 47.2657 20.0827 47.4091 18.8586 47.4203C17.5016 47.4277 16.1452 47.3672 14.7881 47.3746C13.3395 47.3826 11.5651 47.2481 10.4468 46.1638C9.46426 45.2113 9.32849 43.72 9.19472 42.4306C9.01637 40.7234 8.83957 39.0164 8.66434 37.3097L7.68116 27.8192L7.0451 21.6786C7.0344 21.577 7.0237 21.4768 7.01367 21.3745C6.93742 20.642 6.42176 19.925 5.60913 19.962C4.91354 19.9929 4.12299 20.5875 4.20458 21.3745L4.67611 25.927L5.65126 35.3442C5.92905 38.0191 6.20617 40.6944 6.48262 43.3703C6.53613 43.8828 6.58628 44.3967 6.64247 44.9093C6.94812 47.7102 9.075 49.2196 11.7089 49.6448C13.2472 49.8936 14.8229 49.9448 16.384 49.9703C18.3851 50.0026 20.4063 50.08 22.3747 49.7154C25.2915 49.1773 27.4799 47.2185 27.7922 44.1801C27.8814 43.303 27.9706 42.4256 28.0597 41.548C28.3563 38.6458 28.6523 35.7433 28.9479 32.8406L29.9151 23.3562L30.3585 19.0095C30.3806 18.794 30.4711 18.5913 30.6166 18.4315C30.7621 18.2717 30.9549 18.1633 31.1665 18.1223C32.0005 17.9588 32.7977 17.6796 33.391 17.0413C34.3354 16.0249 34.5233 14.6998 34.1896 13.3639Z"/>' +
  "</svg>";

interface NavOptions {
  isZh: boolean;
  path: string;
}

function renderSkipLink(isZh: boolean): string {
  const label = isZh ? "跳到正文" : "Skip to content";
  return '<a class="skip-link" href="#main">' + label + "</a>";
}

function renderNav({ isZh, path }: NavOptions): string {
  const active = activeSection(path);
  const toggleLabel = isZh ? "切换语言" : "Switch language";
  const langAria = isZh ? "EN/中，切换语言" : "EN/中, switch language";
  const menuLabel = isZh ? "菜单" : "Menu";
  const themeLabel = isZh ? "切换主题" : "Toggle theme";
  const navLabel = isZh ? "主导航" : "Main";
  const viewSourceLabel = isZh ? "在 GitHub 上查看源码" : "View source on GitHub";
  const openInNewTabHint = isZh ? "（在新标签页打开）" : "(opens in a new tab)";
  const mobileLangLabel = isZh ? "EN / 中，切换语言" : "EN / 中, switch language";
  const langHref = counterpart(path, isZh);

  const links = NAV_LINKS.map((item) => {
    const isActive = active !== null && item.id === active;
    const href = isZh ? counterpart(item.href, false) : item.href;
    const text = isZh ? item.zhText : item.text;
    return (
      '<a href="' +
      href +
      '" class="top-nav-link' +
      (isActive ? " active" : "") +
      '"' +
      (isActive ? ' aria-current="page"' : "") +
      ' data-nav-id="' +
      item.id +
      '" data-i18n="' +
      item.i18n +
      '">' +
      text +
      "</a>"
    );
  }).join("");

  const langToggle =
    '<a href="' +
    langHref +
    '" id="langToggle" class="lang-toggle" ' +
    'data-i18n-title="nav.toggleLabel" ' +
    'aria-label="' +
    langAria +
    '" title="' +
    toggleLabel +
    '">' +
    '<span class="lang-opt" data-lang="en">EN</span>' +
    "<span>/</span>" +
    '<span class="lang-opt" data-lang="zh">中</span>' +
    "</a>";

  const mobileLang =
    '<a href="' +
    langHref +
    '" class="top-nav-link nav-lang" aria-label="' +
    mobileLangLabel +
    '">' +
    '<span class="lang-opt" data-lang="en">EN</span> / <span class="lang-opt" data-lang="zh">中</span>' +
    "</a>";

  return (
    '<nav class="top-nav" aria-label="' +
    navLabel +
    '">' +
    '<div class="top-nav__inner">' +
    '<a href="' +
    (isZh ? pagePath("home", "zh") : pagePath("home", "en")) +
    '" class="top-nav__brand"><span class="brand-mark" aria-hidden="true">iT</span>ITHMB Codec</a>' +
    '<div class="top-nav-links" id="topNavPanel">' +
    links +
    mobileLang +
    "</div>" +
    '<div class="top-nav-icons">' +
    langToggle +
    '<a href="https://github.com/B67687/Ithmb-Codec" class="github-corner" target="_blank" rel="noopener noreferrer" aria-label="' +
    viewSourceLabel +
    (isZh ? "" : " ") +
    openInNewTabHint +
    '" data-i18n-aria-label="nav.viewSource">' +
    GH_SVG +
    "</a>" +
    '<button id="themeToggle" class="theme-toggle" type="button" data-i18n-aria-label="nav.themeToggle" data-i18n-title="nav.themeToggle" aria-label="' +
    themeLabel +
    '" title="' +
    themeLabel +
    '">' +
    '<svg class="moon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z"/></svg>' +
    '<svg class="sun" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z"/></svg>' +
    "</button>" +
    '<button id="navToggle" class="nav-toggle" type="button" aria-expanded="false" aria-controls="topNavPanel" aria-label="' +
    menuLabel +
    '">' +
    "<span></span><span></span><span></span>" +
    "</button>" +
    "</div>" +
    "</div>" +
    "</nav>"
  );
}

/** Full static shell block for the top of <body>. */
export function renderNavShell(options: NavOptions): string {
  return (
    SHELL_NAV_START +
    "\n" +
    renderSkipLink(options.isZh) +
    renderNav(options) +
    "\n" +
    SHELL_NAV_END
  );
}

/**
 * Copyright notice year: the site's first-publication year, fixed on purpose.
 * The notice records when the work was first published, so it must not churn
 * every January (every consumer reads this one constant — build.mts for the
 * static pages, footer.ts for the no-JS fallback — so a year can never drift
 * between the two paths).
 */
export const COPYRIGHT_YEAR = 2026;

interface FooterOptions {
  isZh: boolean;
  /** Defaults to COPYRIGHT_YEAR; tests may override it explicitly. */
  year?: number;
  /** Current page path, so the footer language link points at its counterpart. */
  path?: string;
}

export function renderFooter({ isZh, year = COPYRIGHT_YEAR, path }: FooterOptions): string {
  const repo = "https://github.com/B67687/Ithmb-Codec";
  const webRepo = "https://github.com/B67687/ithmb-codec-web";
  // Page links are registry lookups by key; no footer href is a hand-written path.
  const pageHref = (key: RouteKey): string => pagePath(key, isZh ? "zh" : "en");
  const notices = pageHref("notices");
  const guide = pageHref("guide");
  const decoder = pageHref("decoder");
  const privacy = pageHref("privacy");

  const col = isZh
    ? { product: "产品", project: "项目", support: "支持这个项目", formats: "格式" }
    : {
        product: "Product",
        project: "Project",
        support: "Support the project",
        formats: "Formats",
      };
  const label = isZh
    ? {
        decoder: "解码器",
        guide: "指南",
        privacy: "隐私",
        plugin: "ImageGlass 插件",
        source: "网站源码",
        notices: "第三方声明",
        coffee: "请作者喝杯咖啡",
        issue: "报告问题",
        ithmb: ".ithmb",
        ipm: ".ipm",
        outputs: "JPEG · PNG · BMP · WebP",
        legal: "版权所有 © ",
        license: "Nami。网站代码采用 MIT 许可证，内置组件遵循各自的许可证。与 Apple 无关。",
        lang: "English · 中文",
      }
    : {
        decoder: "Decoder",
        guide: "Guide",
        privacy: "Privacy",
        plugin: "ImageGlass plugin",
        source: "Website source",
        notices: "Third-party notices",
        coffee: "Buy me a coffee",
        issue: "Report a bug",
        ithmb: ".ithmb",
        ipm: ".ipm",
        outputs: "JPEG · PNG · BMP · WebP",
        legal: "Copyright © ",
        license:
          "Nami. Website code is MIT licensed. Bundled components keep their own licences. Not affiliated with Apple.",
        lang: "English · 中文",
      };

  const langHref = counterpart(path ?? "/", isZh);
  const langAria = isZh ? "English · 中文，切换语言" : "English · 中文, switch language";
  const hint = isZh ? "（在新标签页打开）" : "(opens in a new tab)";

  const footerHtml =
    '<footer class="site-footer">' +
    '<div class="site-footer__inner">' +
    '<div class="site-footer__grid">' +
    '<div><h2 class="site-footer__col-title">' +
    col.product +
    "</h2>" +
    '<a href="' +
    decoder +
    '">' +
    label.decoder +
    "</a>" +
    '<a href="' +
    guide +
    '">' +
    label.guide +
    "</a>" +
    '<a href="' +
    privacy +
    '">' +
    label.privacy +
    "</a></div>" +
    '<div><h2 class="site-footer__col-title">' +
    col.project +
    "</h2>" +
    '<a href="' +
    repo +
    '">GitHub</a>' +
    '<a href="https://github.com/B67687/ImageGlass-Ithmb-Plugin">' +
    label.plugin +
    "</a>" +
    '<a href="' +
    webRepo +
    '">' +
    label.source +
    "</a>" +
    '<a href="' +
    notices +
    '">' +
    label.notices +
    "</a></div>" +
    '<div><h2 class="site-footer__col-title">' +
    col.support +
    "</h2>" +
    '<a href="https://buymeacoffee.com/ThumbNami">' +
    CUP_SVG +
    label.coffee +
    "</a>" +
    '<a href="' +
    repo +
    '/issues">' +
    label.issue +
    "</a></div>" +
    '<div><h2 class="site-footer__col-title">' +
    col.formats +
    "</h2>" +
    '<a href="' +
    decoder +
    '">' +
    label.ithmb +
    "</a>" +
    '<a href="' +
    decoder +
    '">' +
    label.ipm +
    "</a>" +
    '<a href="' +
    decoder +
    '">' +
    label.outputs +
    "</a></div>" +
    "</div>" +
    '<div class="site-footer__legal">' +
    "<p>" +
    label.legal +
    String(year) +
    " " +
    label.license +
    "</p>" +
    '<a class="site-footer__lang" href="' +
    langHref +
    '" aria-label="' +
    langAria +
    '">' +
    label.lang +
    "</a>" +
    "</div>" +
    "</div>" +
    "</footer>";

  // External destinations: target/rel + visually-hidden new-tab hint.
  return footerHtml
    .replace(
      /<a href="(https?:\/\/[^"]+)">/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer">',
    )
    .replace(
      /<a href="(https?:\/\/[^"]+)" target="_blank" rel="noopener noreferrer">([\s\S]*?)<\/a>/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$2<span class="sr-only">' +
        hint +
        "</span></a>",
    );
}

export function renderFooterShell(options: FooterOptions): string {
  return SHELL_FOOTER_START + "\n" + renderFooter(options) + "\n" + SHELL_FOOTER_END;
}
