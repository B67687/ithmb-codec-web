# ARCHITECTURE.md — System Architecture

> Lean C4 Level 1 view. For the feature inventory see `docs/FEATURES.md`; for
> why the project is built this way see `docs/DECISIONS.md`. The tree that serves
> `ithmb-codec.dev` is the curated `_site` artifact, not this repository root.

## Current release facts

Last verified 2026-11-28 on `redesign/apple-tiles` at `30a58d6`. These are the
numbers the other docs quote; when one changes, update the row and the doc that
uses it. The "latest run" test figure is a local run, not a permanent baseline.

| Fact | Value | How to verify |
| --- | --- | --- |
| Deploy artifact | **89 files** in `_site` | `bun run build:pages && find _site -type f \| wc -l` |
| Public mirror | public, **1 commit**, tag **`v2.0.0`**, **239-file** tree | `gh api repos/B67687/ithmb-codec-web/commits?per_page=100 --jq length`; `gh api .../git/trees/main?recursive=1` |
| Sitemap | **10 URLs**, including `/third-party-notices` | `grep -c '<loc>' sitemap.xml` (after build) and `curl -s https://ithmb-codec.dev/sitemap.xml \| grep -c '<loc>'` |
| Post-deploy probe | **72 checks**, all pass | `node scripts/post-deploy-probe.mjs https://ithmb-codec.dev` |
| Tests | **33 spec files**, **894 listed tests** (298 per browser); latest chromium run **297 passed / 1 skipped**; **78 unit tests in 6 files** | `npx playwright test --list`; `npx playwright test --project=chromium`; `bun test tests/unit/` |
| WASM | **247,247 B** decoded; **~91 KB** on the wire (live Brotli 91,466 B; 92,240 B gzip locally); budget < 300 KB | `wc -c ithmb-decoder/ithmb_wasm_bg.wasm`; probe/weight evidence |
| Font | **39,736 B (~40 KB)**; budget ≤ 80 KB | `wc -c ithmb-decoder/fonts/InterVariable-subset.woff2` |
| Watchdogs | **7,000 ms** module-graph, **15,000 ms** init | `grep -n 'GRAPH_WATCHDOG_MS' src/decoder-watchdog.ts`; `grep -n 'INIT_TIMEOUT_MS' ithmb-decoder/limits.ts` |
| i18n | **86 keys** per locale; **37 embedded defaults** compared | `bun run lint:i18n` |
| Version | `package.json` **2.0.0**, public mirror tag **`v2.0.0`** (aligned) | `grep '"version"' package.json`; `git tag --list 'v*'` |
| CI coverage | workflow runs on pushes to `main`, `release` and **`redesign/apple-tiles`**, plus PRs and manual dispatch; CI retries **1** | `.github/workflows/ci.yml` |

## C4 Level 1 — System Context

```
┌──────────────────────────────────────────────────────────────────┐
│                        ITHMB Codec Web                           │
│                                                                  │
│  ┌────────────────────┐                                          │
│  │   Client SPA       │                                          │
│  │   ithmb-decoder/   │                                          │
│  │                    │                                          │
│  │  • app.ts          │                                          │
│  │  • decoder.ts      │                                          │
│  │  • cards.ts        │                                          │
│  │  • viewer.ts       │                                          │
│  │  • failure-info.ts │                                          │
│  │  • i18n.ts         │                                          │
│  │  • download.ts     │                                          │
│  │  • state.ts        │                                          │
│  │  • ui.ts           │                                          │
│  │  • utils.ts        │                                          │
│  └────────┬───────────┘                                          │
│           ▼                                                      │
│  ┌────────────────────────┐                                      │
│  │  ithmb_wasm_bg.wasm    │                                      │
│  │  (Rust → wasm-bindgen) │                                      │
│  │  from Ithmb-Codec repo │                                      │
│  └────────────────────────┘                                      │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Static shell: src/shell.ts (build) + src/theme.ts,         │  │
│  │  src/nav.ts, src/footer.ts; index.html, 404.html, guide/,   │  │
│  │  privacy/, third-party-notices.html, zh/                    │  │
│  │  Registries: src/routes.ts (pages/sitemap/_redirects),      │  │
│  │  ithmb-decoder/formats.ts (export formats)                  │  │
│  │  Decoder boot: assets/js/decoder-boot.js +                  │  │
│  │  assets/js/decoder-watchdog.js                              │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
         │
         ▼
  ┌──────────────┐           ┌──────────────────────┐
  │  User Browser│           │  Cloudflare Pages    │
  │  (local WASM)│           │  production hosting  │
  └──────────────┘           └──────────────────────┘
```

## Module Map

### Decoder SPA (`ithmb-decoder/`)

Authored as TypeScript; the build compiles each `ithmb-decoder/*.ts` to the same
public `ithmb-decoder/*.js` URL (the `.js` files are generated and gitignored).

| Module                  | Responsibility                                                        |
| ----------------------- | --------------------------------------------------------------------- |
| `app.ts`                | Boot, keyboard, dropzone, drag/drop overlay, back-to-top, `languagechange` re-render; queues drops while WASM initialises (init gate), shows loading progress after the 2 s reveal, and owns retry/failure handoff to the boot/watchdog scripts |
| `decoder.ts`            | `decodeFile`: `planDecode` gate → wasm call → success/failure dispatch |
| `decode-pipeline.ts`    | DOM-free `planDecode` (known-prefix/JPEG/multi-frame), `classifyFailure`, `parsePixelHeader` (unit-tested) |
| `profiles.ts`           | GENERATED codec profile table (53 prefixes: frame bytes/strides/alternates); never hand-edit |
| `formats.ts`            | Single registry for output formats: MIME, label, extension, magic header and UI order; inlined into `utils.js` (the format label/extension maps and the Save/ZIP encoder derive from it) |
| `file-digest.ts`        | Full-file SHA-256 fingerprint for batch dedupe (named to avoid filter-list bait; unit-tested) |
| `limits.ts`             | Session limits: 8 MB/file, 200 files, 256 MB, filmstrip/ZIP caps |
| `zip-names.ts`          | Pure ZIP entry naming policy (reserved names, dedupe; unit-tested)    |
| `cards.ts`              | Single owner of decode-result lists (add/query/reset)                 |
| `card-success-ui.ts`    | Success card info panel, format select, Save, `reRenderCards`         |
| `card-failure-ui.ts`    | Failed/unknown result card; error-card renderer                       |
| `failure-info.ts`       | Failure reason, prefix/size metadata, and next-step links (card and viewer) |
| `viewer.ts`             | Viewer stage/header, prev/next, toolbar state, failure info card, viewer refresh |
| `filmstrip.ts`          | Filmstrip placeholders and decoded/failed thumbnails                   |
| `ui.ts`                 | `processFiles`: extension/size filter, content-hash dedup, waves of 4 |
| `input.ts`              | Hold-to-repeat for viewer arrows (400ms grace, 30ms interval)          |
| `i18n.ts`               | en/zh tables, `setLang`, `applyTranslations`, `languagechange`         |
| `download.ts`           | Per-card Save + Download All ZIP via bundled fflate                    |
| `state.ts`              | `S` singleton, `KNOWN_PREFIXES`, processed-file dedup Set             |
| `utils.ts`              | formatSize, showToast, escapeHtml, hex/base64                         |
| `fflate-bundle.js`      | Generated at build time from the `fflate` devDependency; not hand-edited |

### Shared shell and boot modules (`src/`)

| Module                  | Responsibility                                                        |
| ----------------------- | --------------------------------------------------------------------- |
| `src/routes.ts`         | Page/sitemap/redirect registry: one entry per page owns the EN/ZH canonical URLs, authored HTML file, sitemap priority and alias forms. The build generates `sitemap.xml` and `_redirects` from it; shell, 404 remap and failure-info links derive from it |
| `ithmb-decoder/locale.ts` | Single owner of locale identity: pathname ↔ locale, document language, stored `ithmbLang` read/write (`setLocalePreference` is the only writer). Build-time-only at deploy: inlined into `i18n.js` and the classic shell scripts |
| `src/decoder-copy.ts`   | Single source of the decoder boot loading labels and the watchdog failure-panel copy; inlined into the two classic boot scripts |
| `src/shell.ts`          | DOM-free renderers for the static nav/footer/skip-link shell; used by the build and the runtime fallback |
| `src/nav.ts` / `src/footer.ts` | Classic scripts that bind to the build-rendered shell: active state, theme toggle (explicit choice pinned), language persistence before navigation, mobile drawer with scrim, focus move and scroll lock. Compiled to `assets/js/nav.js` / `assets/js/footer.js` |
| `src/theme.ts`          | Pre-paint theme resolution (stored choice, then system preference); the sole owner of theme state via `window.IthmbTheme` (get/set/toggle/subscribe) — consumers subscribe instead of reading `data-theme` or adding matchMedia listeners; an explicit choice stops live OS following. Compiled to `assets/js/theme.js` |
| `src/modal.ts`          | Shared accessible modal/dialog (confirm + lightbox focus trap); bundled into `assets/js/nav.js` and `assets/js/guide.js`, so it adds no request and no artifact file |
| `src/scrollspy.ts`      | Position-based scrollspy with click lock (last section whose top passed the marker); bundled into `assets/js/guide.js` and `assets/js/toc.js` |
| `src/decoder-boot.ts`   | Head classic script (bundled to `assets/js/decoder-boot.js`): starts the single WASM fetch, reports byte progress, and keeps the loading label hidden for the first 2 s on fast loads. Copy comes from `src/decoder-copy.ts` |
| `src/decoder-watchdog.ts` | Head classic script (bundled to `assets/js/decoder-watchdog.js`): **7,000 ms** module-graph and **15,000 ms** init watchdogs (`INIT_TIMEOUT_MS` shared with app.ts via `limits.ts`), one shared failure panel with Retry. Copy comes from `src/decoder-copy.ts` |
| `assets/js/toc.js`      | Privacy "on this page" rail (from `privacy/toc.ts`, via `scrollspy.ts`): position-based active section, click lock until the scroll settles, `aria-current="location"` |
| `assets/js/guide.js`    | Guide path tabs, figure lightbox, copy buttons and the position-based progress rail (from `guide/guide.ts`; `is-active`/`is-done`, 32% viewport marker; via `modal.ts`/`scrollspy.ts`) |
| `src/404-lang.ts`       | Swaps the root 404 copy to Chinese for `/zh/` requests (bundled to `assets/js/404-lang.js`); path detection comes from `locale.ts` |

### Root scripts (`scripts/`)

| Script                    | Gate                                                              |
| ------------------------- | ----------------------------------------------------------------- |
| `build.mts`               | esbuild transform (`.ts` → `.js`, classic scripts to `assets/js/`) + fflate bundle + shell render + `sitemap.xml`/`_redirects` generation + content-hash `?v=` cache-bust |
| `build-site.mts`          | Copy the allowlisted public tree into `_site/`; fail on any forbidden path (deploy-only) |
| `gen-profile-table.mts`   | Regenerate `ithmb-decoder/profiles.ts` from the codec's `profiles.json` (dev-only) |
| `post-deploy-probe.mjs`   | Probe a Preview/production host for status, headers, redirects, 404, deny-list, CSP and beacon (release-only) |
| `extension-harness.mjs`   | Headful Chromium + unpacked-extension compatibility check (local pre-deploy, not CI) |
| `check-i18n.mts`          | i18n integrity (key parity, raw literals, EMBEDDED_EN drift, embedded defaults) |
| `check-mirror-parity.mts` | EN/zh page parity + zero-third-party-resource check               |
| `check-wasm-drift.sh`     | wasm import match                                                 |
| `check-local.sh`          | Full local CI (10 steps)                                          |
| `check-parity.sh`         | Local↔GitHub result parity for the same commit                    |
| `check-audit.mts`         | Fail-closed `bun audit` wrapper (dev-only)                         |
| `check-public-tree.mts`   | Public mirror allowlist + leak scan (dev-only)                    |
| `sync-embedded.mts`       | Regenerate `EMBEDDED_EN` from `locales/en.json`                   |
| `test-check-parity.sh`    | Hermetic edge-case tests for the parity gate (mocked `gh`/`jq`)   |
| `real-user-journey.mts`   | **Legacy**: drives the removed contribution UI; excluded from the public mirror |
| `publish.sh`              | **Legacy**: the earlier release-branch promotion flow; the current deploy is the `_site` direct upload in `docs/RUNBOOK.md` |

### Tests (`tests/`)

33 Playwright specs (a11y, back-scroll, behavior-fixes, build-pipeline, contrast, copy-sources, dark-mode, decode-failure, decoder-integrity, decoder-polish, decoder-smoke, decoder-ui3/4/5, extension-blockers, gallery, glass-nav, ithmb-decoder, launch-blockers, link-policy, mobile-nav, pages, perf-budget, quality, regression-fixes, routes, seo-metadata, state-hooks, stress, toc-lock, ui-fixes, upload, visual) with **894 listed tests** (298 per browser project). Latest local chromium run: **297 passed, 1 skipped, 0 failed** (2026-11-28, ~36 s). Plus **78 bun unit tests in 6 files** under `tests/unit/` (`bun:test`, incl. port-regression). Tiers are in `docs/TEST_STRATEGY.md`.

## Fitness Functions

| Metric                | Threshold  | Enforcement                                          |
| --------------------- | ---------- | ---------------------------------------------------- |
| File length           | ≤ 250 LOC  | Review guideline (locale tables excepted)            |
| Function length       | ≤ 40 LOC   | Review gate                                          |
| Cyclomatic complexity | ≤ 10       | Review gate                                          |
| `unwrap` (Rust deps)  | 0          | wasm-drift + review                                  |
| a11y violations       | 0 critical/serious | `tests/a11y.spec.ts` (Playwright) blocks CI  |
| Runtime npm dependencies | 0       | `package.json` contract; fflate is a devDependency bundled into `fflate-bundle.js` at build time |
| Generated file edit   | Forbidden  | `check:local` build determinism                      |

## Local vs GitHub CI

| Gate                      | Local (`check:local`) | GitHub CI | Why GitHub?                                |
| ------------------------- | :-------------------: | :-------: | ------------------------------------------ |
| audit (fail-closed via `check-audit.mts`) | ✅ | — | Local is enough                   |
| `bun outdated` (informational)            | ✅ (never fails) | — | Local is enough              |
| typecheck (2 tsconfigs)   |          ✅           |    ✅     | Deterministic                              |
| unit tests (bun test)     |          ✅           |    ✅     | Fast, no browser                           |
| biome format gate (1.9.4) | — (run `bun run format:check`) | ✅ | Format-only; lint unenforced          |
| build + determinism       |          ✅           |    ✅     | Clean build check                          |
| i18n + mirror parity      |          ✅           |     —     | Local is enough                            |
| public-tree mirror gate   |          ✅           |    ✅     | CI runs it when the dev-only tooling exists; skipped on the mirror |
| wasm-drift                |          ✅           |    ✅     | Cheap and deterministic                    |
| Playwright (chromium)     |          ✅           |    ✅     | Core browser                               |
| Playwright (firefox)      |          ✅           |    ✅     | CI matrix (PR only)                        |
| Playwright (webkit)       |  ❌ (browser not installed) | ✅ | Needs CI runner (PR only, sharded 2×)  |
| contrast gate             |          ✅           |    ✅     | `tests/a11y.spec.ts` (colour-contrast enabled) + `tests/contrast.spec.ts` pin the CH-15 regression |
| parity gate tests         |          ✅           |     —     | Local is enough                            |

**Local time target: < 2 minutes for the fast loop (Tier 1, and Tier 2 chromium
below that budget).** `check:local` is the full gate set and also runs the
Playwright config for every installed browser, so it takes longer; on a machine
without the webkit browser installed, install it or that step fails.

**CI coverage:** `.github/workflows/ci.yml` triggers on pushes to `main`,
`release` and `redesign/apple-tiles`, plus pull requests and manual dispatch, so
the launched branch is push-covered. CI runs Playwright with **retries 1**
(locally 0) and two workers; the a11y gate enables `color-contrast`, and the
decoder/theme/TOC/drawer specs poll the published data-state hooks
(`html[data-decoder-state]`, `body[data-decode-phase]`,
`body[data-viewer-state]`) instead of fixed sleeps. Run
`bun run check:local` when a local gate is cheaper than waiting for CI.

## Deployment

The served tree is the curated `_site` artifact, built locally and uploaded to
Cloudflare Pages. This repository root is never a web root, and Pages does not
run a build for this project.

- **Artifact:** `bun run build:pages` = `bun run build` +
  `scripts/build-site.mts`. The builder copies an explicit allowlist of public
  files into `_site/` (**89 files** at the current release), rejects source/
  tests/docs/scripts/dotfiles/package metadata by pattern, and fails when a
  required page is missing. CSS source layers under `ithmb-decoder/css/` are
  dev-only and are not shipped; the artifact carries the concatenated
  `styles.css` plus page stylesheets. `_headers` (CSP, security headers, cache
  policy) and `_redirects` (www→apex, legacy paths, `.html`→extensionless,
  `/guide/`→canonical) travel inside the artifact.
- **Hosting:** Cloudflare Pages receives a direct upload of `_site`
  (`wrangler pages deploy _site --project-name <project> --branch preview|release --commit-dirty=true`).
  Project settings, the production branch label and the custom domain live in
  the Cloudflare dashboard, not in the repo (no `wrangler.toml`); the runbook
  records the procedure, provenance and clean-project recreation.
- **Release gate:** preview upload → `scripts/post-deploy-probe.mjs` (**72
  checks**: pages, redirects, 404 + locale 404, deny-list, headers/CSP, cache,
  sitemap, WASM MIME, one WASM request, no beacon/third-party runtime) →
  extension harness → owner sign-off → production upload → probe the apex →
  re-add/keep the custom domain. A failed probe blocks promotion; rollback is the
  previous Pages deployment, and a privacy regression means detaching the custom
  domain first.
- **Provenance:** the upload is a local directory, not a git ref.
  `--commit-dirty=true` is required because the build rewrites tracked HTML
  `?v=` hashes. Record the release SHA, a `_site` SHA-256 manifest and the Pages
  deployment ID together; the probe proves the host contract but cannot prove
  which commit is live. See the runbook's deploy section.
- **Public mirror:** `B67687/ithmb-codec-web` is rebuilt on every publish as a
  single orphan commit plus a version tag (currently `v2.0.0`), from the same
  verified tree and `public-manifest.txt` allowlist (**239 files** in the current
  tree). It runs no CI and is not a deploy source;
  `scripts/check-public-tree.mts` is the gate. See `docs/SOURCE-PUBLISH.md`.
- **WASM updates:** copy only `ithmb_wasm_bg.wasm` from a public codec release;
  regenerate `profiles.ts` when the codec profile table changes; the
  hand-adapted loader and glue stay unchanged, and `check-wasm-drift.sh` gates
  the import surface.

`docs/RUNBOOK.md` is the operational source for deploy, rollback, token
rotation, clean Pages project recreation, domain re-add and probes. It is private
to the dev repo (excluded from the public mirror).

## Stylesheet architecture (Tier B1)

ithmb-decoder/styles.css is a build artifact. The source is authored as
ordered layers in ithmb-decoder/css/ and concatenated by scripts/build.mts:

| Layer | File | Contents |
| --- | --- | --- |
| 0 | 0-tokens.css | every design variable (colour, type, radius, shadow, glass) — the single token layer, light + dark |
| 1 | 10-base.css | reset, document defaults, typographic scale primitives |
| 2 | 20-components.css | shared chrome: navigation, footer, buttons, cards, dialogs, home hero mock |
| 3 | 30-decoder.css | decoder shell, toolbar, viewer band, results, filmstrip, failure info |
| 4 | 40-pages.css | page-specific rules for the 404, home and privacy pages plus the typography pass |
| 5 | 50-polish.css | late layout/accessibility passes (the remaining override layer, being flattened in B1b) |
| 6 | 60-glass.css | approved Medium glass materials, fallbacks, reduced motion |

Page stylesheets (guide/guide.css, privacy/redesign.css, home-mock.css)
consume the shared tokens from layer 0; they must not define their own copies
of core colour/type/radius/glass tokens. Page-local tokens are allowed only
when documented next to the definition.

The numbered source layers are dev-only: `scripts/build-site.mts` ships the
concatenated `styles.css` and the page stylesheets, not `ithmb-decoder/css/**`.
Editing `styles.css` directly is always wrong; edit the layer and rebuild.

## Copy sources

Static pages (home, guide, privacy, 404, EN and zh) keep their copy **inline in
the HTML**, localized per tree; they must not carry data-i18n hooks. The
decoder is the only locale-driven surface (ithmb-decoder/locales/en.json /
zh.json) because it re-renders at runtime on a language switch.
`tests/copy-sources.spec.ts` enforces both rules.

## Build pipeline (Tier B2)

bun run build (scripts/build.mts) is the single source of generated artifacts:

- **Static shell.** Nav, footer and skip link are rendered into every page at
  build time from `src/shell.ts` (same renderers the runtime fallback uses),
  delimited by `<!-- shell:nav|footer:start/end -->` markers. `src/nav.ts` /
  `src/footer.ts` then bind to the existing markup (active state, theme toggle,
  language switch, mobile drawer, scrolled-nav glass, same-page guard) instead
  of injecting it, so crawlers and no-JS visitors get every link and there is no
  duplicate render.
- **Generated sitemap and redirects.** `sitemap.xml` and `_redirects` are both
  generated from the page registry in `src/routes.ts` (canonical EN/ZH forms,
  404/noindex excluded, alias forms and legacy redirect groups). The current
  sitemap has **10 URLs**, including `/third-party-notices` and
  `/zh/third-party-notices`; the probe and `tests/build-pipeline.spec.ts` guard
  the URL set. `<lastmod>` is intentionally omitted so builds are
  deterministic; page templates emit the hreflang alternates.
- **Classic scripts and inlined registries.** `src/*.ts` page scripts compile to
  `assets/js/*.js` (no page JavaScript at the repository root), `guide/guide.ts`
  and `privacy/toc.ts` compile to `assets/js/guide.js` / `assets/js/toc.js`,
  `src/modal.ts` and `src/scrollspy.ts` are bundled into the classic page
  scripts, and `ithmb-decoder/formats.ts` / `locale.ts` / `decoder-copy.ts` are
  inlined at build time. The build adds no artifact file for these registries:
  the shipped file set is unchanged.
- **Content hashing.** The build content-hashes every local asset reference in
  HTML (src, href, srcset, including files that previously had no ?v=),
  every ES-module import specifier in the decoder graph, the font URLs inside the
  generated stylesheet, and the locale JSON URLs fetched by i18n.js.
  _headers marks JS/CSS/WASM/fonts immutable; hashed URLs make that safe. The
  build fails if a module import, font or locale URL is left unhashed.

## Decoder filmstrip + soft-light atmosphere (UI pass)

- **Filmstrip rail.** The nav shell aside, the viewer's thumbnail strip is a
  dedicated scroll track (.filmstrip-track inside #viewer-filmstrip) with the
  count pill outside the scroller. Thumbs are 80×55 desktop / 68×46 phone /
  62×44 at ≤360px, 12/10/8px gaps, snap-scrolling, wheel-to-horizontal support,
  JS-toggled edge fades (can-scroll-left / can-scroll-right), inset active
  ring, inset blue focus ring, and an active thumb that scrolls into view when
  the viewer navigates. Thumbnail bitmaps are drawn at 2× the rendered box
  (filmstrip.ts).
- **Viewer band.** Theme-aware tokens --viewer-bg (light #1c1c1e, dark
  #000), --viewer-glow (radial light inside the band) and --viewer-edge
  (short page-coloured fades at the band's top/bottom edge so the page→viewer
  transition is a gradient, not a hard black edge). No layout change; the dark
  band convention is preserved.
- **Soft-light gradient system.** Large, very low-opacity washes defined as
  per-theme tokens in 0-tokens.css: --wash-hero, --wash-hero-visual,
  --wash-section, --wash-support, --wash-page-top, --wash-footer,
  --viewer-glow, --film-count-bg, --film-thumb-ring.
  Applied as static background-image layers on the home hero + visual + fog
  sections + support band + footer, guide/privacy page tops, the 404 body, and
  the decoder viewer band. No new blur/backdrop-filter layers; text contrast was
  measured before/after (all content text stays ≥14:1; the measurement is in the
  launch UI2 evidence held in the dev workspace).

## Viewer surfaces and surface modes (UI4)

The decoder viewer band, its chrome and the ambient layer read one token set, so
its treatment is a theme decision rather than component CSS:

- --viewer-bg, --viewer-edge, --viewer-glow - band background and page edge fades.
- --viewer-fg, --viewer-fg-muted - band text.
- --viewer-glass, --viewer-glass-strong, --viewer-glass-ring - meta pill, arrows, filmstrip rail, count pill, failure card.
- --viewer-arrow-bg, --viewer-arrow-hover-bg, --viewer-arrow-fg - arrows.
- --viewer-count-bg, --viewer-count-fg - the N / M counter.
- --viewer-thumb-ring, --viewer-thumb-active, --viewer-tile-bg, --viewer-tile-glyph - filmstrip thumbs.
- --viewer-link, --viewer-focus-ring, --viewer-image-shadow.
- --ambient-mix, --ambient-mix-strong - ambient glow strength (plus the sampled --ambient-1/2/3 colours).

Default is **theme-matched**: light site gets a light #f2f2f5 band with dark
controls; dark site gets the black band. Alternate treatments can be prototyped
without touching component CSS by setting data-viewer-mode on <html>:
dark-stage (dark band in both themes) or inverted (light band on the dark
site, dark band on the light site). The token overrides live next to the theme
tokens in 0-tokens.css; the default attribute is absent.
