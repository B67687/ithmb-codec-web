# SPECIFICATION.md

> **Status: AS-BUILT.** project in IMPLEMENTED/POLISHED phase. This specification describes the system as it exists and as it is being maintained, not a greenfield design.
>
> **Three layers:** MACRO (system), MESO (component), MICRO (implementation).
>
> **Input:** consumes validated assumptions from the Ithmb-Codec core project (this repo is the web surface over the `ithmb-core` decoding engine).

## How to Read This Spec

**Design influences:** Volere, IEEE 830, Shape Up, and Jackson Structured Design.

| Layer | Scope                    | Example                               |
| ----- | ------------------------ | ------------------------------------- |
| MACRO | The whole system         | The ithmb-codec.dev website           |
| MESO  | A component              | The decoder SPA |
| MICRO | An implementation detail | A single ES module                    |

**Priority tiers:** Tier 1 = sections 0-7 (any project), Tier 2 = sections 8-11 (production), Tier 3 = sections 12-14 (ecosystem). Section 15 is the verification checklist.

---

## 0. Constitution (Immutable Project Rules)

```
Ithmb-Codec-Web Constitution:

1. Privacy first. User files and decoded data never leave the browser. The website has no upload endpoint.
2. Correctness. Decoded output must faithfully represent the .ithmb content; never emit fabricated or approximate pixels.
3. No magic. Every build step, translation, and network call must be discoverable and reproducible.
4. Inward dependency. The web layer depends on the ithmb-core engine, never the reverse.
5. Test what matters. The decode path and the i18n mirrors carry the highest test weight.
6. Fail with context. Every error surfaced to the user must be actionable and honest.
7. Tool-first. Use the repo's canonical scripts and gates rather than ad hoc commands.
8. No new runtime dependency without a Y-Statement. Dependencies are deliberate, pinned, and audited.
```

**MESO/MICRO:** These rules bind every module and every line. A rule violation is a REVIEW failure, not a style preference. The no-upload privacy rule (1) is the single most important invariant.

## 1. Overview & Derived Ambition

### MACRO: System Vision

```
Project name: Ithmb-Codec-Web
One-line: A free, private, browser-based decoder for Apple .ithmb (iThumbnail) files.
Core ambition: Let anyone open .ithmb files in a browser with zero upload, zero account, zero tracking.
Why now: .ithmb files are opaque to normal image viewers; users lack a safe way to open them.
Success criteria WHEN...THEN:
  WHEN a user drops a .ithmb file onto the page THEN it decodes entirely in-browser without any network upload.
  WHEN a decode fails THEN the page explains what was read and links to GitHub issues and the guide. Nothing is uploaded.
  WHEN the site is loaded THEN no request that identifies the visitor is made.
Stakeholders: End users opening .ithmb files, privacy-conscious users, the Ithmb-Codec maintainer.
```

**MESO/MICRO:** The ambition is delivered by two cooperating components: the decoder SPA (`ithmb-decoder/`) and the static informational pages (Home, Guide, Privacy, etc.). The SPA does the actual decoding via WASM; the static pages explain and route. There is no upload or contribution endpoint.

### OUT OF SCOPE (V1)

- Server-side decoding. All decoding is client-side in the browser.
- User accounts, profiles, or saved history. There is no login and no persistence of user files.
- Batch server processing or an API for third parties.
- Anything that sends user file content automatically.

## 2. Architecture & Design Decisions

The rationale for the architecture and product boundaries is recorded once in
[`docs/DECISIONS.md`](docs/DECISIONS.md) (D-001…D-013: static no-framework site,
curated `_site` artifact, no contribution/upload flow, no analytics/cookies,
local-only privacy, orphan-commit source mirror, Cloudflare Pages, decoder/WASM
split, support boundaries, browser claims, Chinese copy, performance budgets, no
PhotoDB yet). This specification describes the resulting contracts; it does not
duplicate the rationale. `docs/adr/` keeps the dated technical decisions.

## 3. File Tree & Module Responsibilities

| Path                               | Responsibility                                              | HIDES / EXPORTS / CALLER / Pre / Post / Invariant                               |
| ---------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `ithmb-decoder/app.ts`             | Boots the decoder SPA; wires modules together (compiles to `app.js`) | CALLER of viewer, ui, download, state, input, i18n, card-success-ui, ithmb_wasm; queues drops during init, reveals loading progress after 2 s, owns retry/failure handoff |
| `ithmb-decoder/decoder.ts`         | Orchestrates WASM decode: planDecode gate then decode_ithmb (compiles to `decoder.js`) | Pre: file bytes; Post: success canvas or failure/error; rejects heuristic-only unknown prefixes and clips multi-frame payloads |
| `ithmb-decoder/decode-pipeline.ts` | DOM-free branch logic: planDecode, classifyFailure, pickFrame, parsePixelHeader | PURE; unit-tested in tests/unit/decode-pipeline.test.ts |
| `ithmb-decoder/profiles.ts`        | GENERATED codec profile table (53 prefixes: frameBytes/frameStride/alternates) | Generated by scripts/gen-profile-table.mts from ithmb-codec profiles.json; never hand-edit |
| `ithmb-decoder/formats.ts`         | Single registry for output formats (MIME, label, extension, magic header, UI order) | Inlined into `utils.js`; consumers: download, card-success-ui, viewer, state, build-site |
| `ithmb-decoder/file-digest.ts`     | Full-file SHA-256 fingerprint for batch dedupe (renamed from `fingerprint.js` for filter-list compatibility) | PURE; unit-tested in tests/unit/file-digest.test.ts |
| `ithmb-decoder/limits.ts`          | Session caps: 8 MB/file, 200 files, 256 MB, filmstrip/ZIP limits | EXPORTS LIMITS; single source for caps |
| `ithmb-decoder/zip-names.ts`       | Pure ZIP entry naming (reserved names, dedupe) | PURE; unit-tested in tests/unit/download-naming.test.ts |
| `src/routes.ts`                    | Page/sitemap/redirect registry: EN ↔ ZH canonical pages, sitemap priority, alias forms | CALLER build (`sitemap.xml`, `_redirects`, shell paths), shell, 404 remap, failure-info |
| `src/shell.ts`                     | DOM-free nav/footer/skip-link renderers used by build + runtime fallback | Generated markup markers `shell:nav:start/end` and `shell:footer:start/end` |
| `src/modal.ts`                     | Shared accessible modal/dialog (confirm, lightbox focus trap) | Bundled into `assets/js/nav.js` + `assets/js/guide.js`; no own artifact file |
| `src/scrollspy.ts`                 | Position-based scrollspy with click lock | Bundled into `assets/js/guide.js` + `assets/js/toc.js`; no own artifact file |
| `src/decoder-copy.ts`              | Single source of boot loading labels and watchdog failure-panel copy | Inlined into the two classic boot scripts |
| `src/theme.ts`                     | Pre-paint theme resolution; explicit choice pinned against OS changes | Classic script in `<head>` (`assets/js/theme.js`) |
| `privacy/toc.ts` → `assets/js/toc.js` | Privacy on-this-page rail: position-based active section, click lock, `aria-current` | Classic script; CSP external only |
| `guide/guide.ts` → `assets/js/guide.js` | Guide tabs, lightbox, copy buttons, position-based progress rail | Classic script; CSP external only |
| `src/decoder-boot.ts` → `assets/js/decoder-boot.js` | Starts the single WASM fetch, reports byte progress, hides the loading label for 2 s | Head classic script; CSP external only |
| `src/decoder-watchdog.ts` → `assets/js/decoder-watchdog.js` | **7,000 ms** module-graph / 15,000 ms init watchdogs, one failure panel with Retry | Head classic script |
| `src/404-lang.ts` → `assets/js/404-lang.js` | Localizes the root 404 for `/zh/` requests | External script (CSP forbids inline) |
| `ithmb-decoder/viewer.ts`          | Viewer stage/header, prev/next, toolbar state, failure info card | EXPORTS open/close/navigate/updateToolbar                 |
| `ithmb-decoder/filmstrip.ts`       | Filmstrip placeholder and thumbnail rendering               | CALLER card-success-ui, card-failure-ui, app                                   |
| `ithmb-decoder/state.ts`           | App state, KNOWN_PREFIXES, processed-file dedup | HIDES state shape; Invariant: no uploads                                  |
| `ithmb-decoder/ui.ts`              | File cards, processFiles (batch/dedup/waves)                | CALLER cards, decoder, viewer                                                   |
| `ithmb-decoder/card-success-ui.ts` | Success card info panel, save, reRenderCards | CALLER filmstrip, viewer |
| `ithmb-decoder/card-failure-ui.ts` | Failure card with failure info; error card renderer         | Invariant: error cards are never stored                                         |
| `ithmb-decoder/failure-info.ts`    | Failure reason, prefix/size metadata, and next-step links   | CALLER card-failure-ui, viewer                                                  |
| `ithmb-decoder/cards.ts`           | Single owner of decode-result lists                         | EXPORTS add/query/reset                                                         |
| `ithmb-decoder/utils.ts`           | Shared helpers (hex/base64, size, toast, escape)            | EXPORTS pure helpers                                                            |
| `ithmb-decoder/input.ts`           | Hold-to-repeat for arrows                                   | Pre: pointer/touch; Post: repeated navigation                                   |
| `ithmb-decoder/download.ts`        | Per-card save + Download All ZIP via bundled fflate         | CALLER cards, state, formats; quality 92% ZIP / 95% per-card                    |
| `ithmb-decoder/i18n.ts`            | en/zh tables, embedded EN fallback, languagechange event (compiles to `i18n.js`) | CALLER locales/*.json                                          |
| `ithmb-decoder/fflate-bundle.js`   | Generated bundle of the fflate devDependency                | Generated at build; do not hand-edit                                            |
| `ithmb-decoder/ithmb_wasm.js`      | Hand-adapted WASM loader                                    | DO NOT REPLACE                                                                  |
| `ithmb-decoder/ithmb_wasm_bg.js`   | Generated wasm glue                                         | Generated; do not edit                                                          |
| `ithmb-decoder/ithmb_wasm_bg.wasm` | The compiled engine (**247,247 B** decoded; ~91 KB Brotli on the wire) | Copied from Ithmb-Codec                                            |
| `scripts/build.mts`                | Build pipeline (esbuild `.ts`→`.js`, fflate bundle, shell render, `sitemap.xml`/`_redirects`, `?v=` cache-bust) | GENERATES .js from .ts; deterministic                              |
| `scripts/check-local.sh`           | Local parity checks (10 gates)                              | Mirrors CI locally                                                              |
| `scripts/check-parity.sh`          | Local-vs-GitHub result parity for one commit                | Requires gh/jq/clean tree                                                       |

## 4. Quality Gates

| Gate                 | Requirement (EARS)                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| G1 Build             | WHEN the build runs THEN it must complete via `bun run build` with no errors.                                       |
| G2 Typecheck         | WHEN any TS changes THEN `bun run typecheck` (both tsconfigs) must pass.                                           |
| G3 i18n parity       | WHEN any locale or string changes THEN `bun run lint:i18n` must pass.                                               |
| G4 Test suite        | WHEN the test suite runs THEN all Playwright projects (chromium/firefox/webkit) must pass.                          |
| G5 WASM drift        | WHEN the wasm changes THEN `scripts/check-wasm-drift.sh` must detect and gate.                                      |
| G7 Secrets           | WHEN a commit is prepared and gitleaks is installed THEN the pre-commit hook must find no secrets.                   |

## 5. Dependencies & External Contracts

| Package                           | Version         | Purpose                                     | Contract         | License    |
| --------------------------------- | --------------- | ------------------------------------------- | ---------------- | ---------- |
| `esbuild`                         | dev             | TS/JS bundling and transform                | build only       | MIT        |
| `typescript`                      | dev             | Type checking                               | build only       | Apache-2.0 |
| `playwright` / `@playwright/test` | dev             | Browser testing                             | dev only         | Apache-2.0 |
| `fflate`                          | 0.8.3 (dev)     | ZIP generation; bundled into `fflate-bundle.js` at build | shipped, bundled | MIT        |
| `Inter` (variable font subset)    | subset          | UI webfont; `ithmb-decoder/fonts/InterVariable-subset.woff2` | shipped asset    | SIL OFL 1.1 |
| `wasm-bindgen`                    | 0.2.126         | Rust → WebAssembly bindings; generated glue in `ithmb_wasm.js` / `ithmb_wasm_bg.js` | shipped, generated | MIT OR Apache-2.0 |
| `ithmb-core`                      | 1.9.10          | Decoding engine compiled to `ithmb_wasm_bg.wasm` | shipped, compiled | MIT        |
| `bun`                             | 1.3.14 (pinned) | Script + unit-test runtime, package manager | dev only         | MIT        |
| `http-server`                     | dev             | Local static serving                        | dev only         | MIT        |
| `@axe-core/playwright`            | dev             | Accessibility testing                       | dev only         | MIT        |
| `@types/node`                     | dev             | Node type definitions                       | dev only         | MIT        |
| `@types/bun`                      | dev             | Bun test/type definitions                   | dev only         | MIT        |
| `undici`                          | override        | HTTP client patch                           | override         | MIT        |

All packages in `package.json` are devDependencies; the page makes no third-party requests at runtime. The shipped third-party components are `fflate` (MIT, compiled into `ithmb-decoder/fflate-bundle.js` at build time), the Inter variable font subset (SIL OFL 1.1), the wasm-bindgen glue (MIT or Apache-2.0) and the project's own `ithmb-core` decoding engine (MIT). Copyright and licence notices are served at `/third-party-notices` (with a `/zh/third-party-notices` translation), and the font licence text is served at `/OFL.txt`. Lockfile (`bun.lock`) is tracked; installs via `bun install --frozen-lockfile`.

## 6. UX & Interface Contract

**Entry points:** `/` (Home), `/ithmb-decoder/` (Decoder SPA), `/guide/how-to-open-ithmb-files` (Guide; canonical extensionless URL), `/privacy/`, `/third-party-notices`, `/404.html` (plus `/zh/404.html` for the localized 404), and the `/zh/` mirror of Home, Decoder, Guide, Privacy and third-party notices. Every page carries the shared nav and footer.

**EARS behavior:** WHEN the user drops a file on the decoder THEN it decodes in-browser; WHEN decoding succeeds THEN the decoded image renders in the card at up to 600x400 CSS pixels; WHEN decoding fails THEN a failure info card explains what was read and links to next steps.

**Error contract:** All user-facing errors are honest and actionable. Nothing is uploaded.

## 7. Timeline / Milestones

| Milestone    | Content                                                         |
| ------------ | --------------------------------------------------------------- |
| M1 (done)    | Core decoder SPA decoding .ithmb via WASM                       |
| M2 (done)    | Static pages, en/zh i18n, guide                                             |
| M4 (done)    | Full Playwright suite across 3 browser projects, CI on GitHub Actions |
| M5 (done)    | Release 1.5.0: mobile chrome, cache-busting, mirror hygiene      |
| M6 (done)    | Apple-tiles redesign, contribution flow removed, curated `_site` deploy, public mirror `v2.0.0` (2026-11-26) |

**Circuit breaker:** If the WASM drift gate, i18n parity gate, or test suite regresses, work stops and the gate must be fixed before any further changes.

## 8. Testing Strategy

- **Playwright E2E** across chromium/firefox/webkit: 33 spec files, 894 listed tests (298 per browser project; pages, decoder, gallery, stress, upload, quality, a11y, contrast, SEO metadata, state hooks, visual, dark-mode, decode-failure, decoder-integrity, decoder-polish, decoder-ui3/4/5, behavior-fixes, regression-fixes, ui-fixes, perf-budget, mobile-nav, back-scroll, build-pipeline, copy-sources, decoder-smoke, extension-blockers, glass-nav, launch-blockers, link-policy, routes, toc-lock). Latest full local chromium run: 297 passed, 1 skipped, 0 failed (2026-11-28). Plus 78 unit tests in `tests/unit/` (execution tiers frozen in docs/TEST_STRATEGY.md).
- **Extension compatibility** harness (`bun run test:extensions`) is a local pre-deploy check for unpacked content blockers; `tests/extension-blockers.spec.ts` guards the no-filter-list-bait resource naming in CI.
- **i18n parity** gate ensures en/zh mirrors stay in sync.
- **WASM drift** gate ensures the bundled wasm stays in sync with the core.
- **Post-deploy probe** gates the host: headers/CSP, redirects, 404, deny-list, cache, WASM MIME, one WASM request and no analytics beacon.
- Priority: decode correctness, the no-upload privacy rule, i18n parity, and a11y carry the highest weight.

## 9. Operational Resilience

- Static hosting via Cloudflare Pages with a custom domain (`ithmb-codec.dev`). The deployable tree is the curated `_site` artifact (`bun run build:pages`), uploaded directly with `wrangler pages deploy`; the Pages project has no build command or Git integration. `_headers` sets CSP/security headers and `_redirects` (generated from `src/routes.ts`) handles URL canonicalization; `404.html` + `assets/js/404-lang.js` serve the localized 404. The sitemap has 10 URLs, including `/third-party-notices` and `/zh/third-party-notices`.
- Deploy proof: `scripts/post-deploy-probe.mjs` on a preview, then production (72 checks); extension harness on the same host; the public mirror is rebuilt from the same verified tree as one orphan commit plus a version tag.
- Provenance: the upload is a local directory, not a git ref. Record the release SHA, a `_site` SHA-256 manifest and the Pages deployment ID together. `--commit-dirty=true` is required because the build rewrites tracked `?v=` hashes; the probe verifies the host contract, not which commit is live.
- CI runs on pushes to `main`, `release` and `redesign/apple-tiles`, plus pull requests and manual dispatch. CI Playwright uses retries 1; the a11y gate enables `color-contrast` and the decoder/theme/TOC/drawer specs poll data-state hooks instead of fixed sleeps.
- No user data is stored server-side: the site is static and has no upload or contribution endpoint.

## 10. Build & Release Pipeline

- Local: `bun run build` (esbuild `.ts`→`.js`, classic scripts to `assets/js/`, fflate bundle, shell render, generated `sitemap.xml`/`_redirects`, content-hash `?v=` rewrite), `bun run typecheck`, `bun run test`, or `bun run check:local` for the full 10-gate set.
- Artifact: `bun run build:pages` = build + `scripts/build-site.mts`, producing the curated `_site/` (89 files at the current release; CSS source layers are dev-only and not shipped). The builder allowlists site files and fails on any forbidden path.
- CI (dev repo only) runs on pushes to `main`, `release` and `redesign/apple-tiles`, plus pull requests and manual dispatch: a lint job (biome format gate, typecheck + build + determinism, public-tree, unit tests, wasm-drift) and browser jobs (chromium on push and PR; firefox and two webkit shards on PR only). Doc-only changes skip CI unless the workflow itself changed. Playwright retries are 1 on CI (0 locally); the a11y gate enables `color-contrast` and the decoder/theme/TOC/drawer specs poll data-state hooks instead of fixed sleeps.
- Deploy: direct upload of `_site` to Cloudflare Pages (`wrangler pages deploy _site --branch preview|release --commit-dirty=true`), proven by the 72-check `scripts/post-deploy-probe.mjs` before promotion; the custom domain is re-added only after a preview passes. Rollback is the previous Pages deployment. Record the release SHA, `_site` hash manifest and deployment ID together. The runbook (`docs/RUNBOOK.md`) owns the exact commands, token rotation, provenance, clean-project recreation and domain re-add.
- The public repo (`B67687/ithmb-codec-web`) is an allowlisted source mirror rebuilt as one orphan commit per publish; it runs no CI and is not the deploy source. See `docs/SOURCE-PUBLISH.md`.
- **MESO Distribution Surfaces:** (1) the public Cloudflare Pages site at ithmb-codec.dev, and (2) the public GitHub mirror. The website is the only user-facing surface.

## 11. Design for Change

| Change              | Impact                          | Notes                         |
| ------------------- | ------------------------------- | ----------------------------- |
| New locale          | i18n.json files + parity gate   | Small, isolated               |
| New decoder feature | decoder.ts, ui.ts, tests       | Medium, test-heavy            |
| New output format   | ithmb-decoder/formats.ts + encoder tests | Small, registry-driven |
| WASM engine update  | ithmb_wasm_bg.wasm + drift gate | Large, must re-run full suite |
| New page            | src/routes.ts entry + static HTML + tests | Small              |

Size rule: keep modules under the 250/40 guideline (250 lines, 40 responsibilities); a module that grows beyond it should be split into cohesive submodules.

## 12. Documentation Strategy

- `README.md`: user-facing overview, quick start and docs map.
- `docs/DECISIONS.md`: canonical "why" record for architecture and product boundaries.
- `docs/FEATURES.md`: feature inventory (F-### IDs) with behaviour contracts and test anchors.
- `docs/DESIGN.md`: design tokens, themes, fonts, components and page chrome.
- `docs/TEST_STRATEGY.md`: test tiers, budgets, CI gates and the bug-link rule.
- `docs/RUNBOOK.md`: operational runbook, private to the dev repo (deploy, rollback, tokens, domain, probe).
- `docs/SOURCE-PUBLISH.md`: public mirror allowlist and one-orphan-commit publish invariant.
- `SPECIFICATION.md`, `ARCHITECTURE.md`: contracts and system map.
- `CHANGELOG.md`: release history (historical entries are not rewritten).
- `docs/adr/`: dated architecture decision records.

## 13. Ecosystem & Community

- License: **MIT** (see `LICENSE`). Third-party notices: `third-party-notices.html`; Inter font licence: `OFL.txt`.
- The site is the user-facing surface of the ithmb-codec ecosystem; the decoder engine lives in the sibling `ithmb-codec` repo.
- Contributions follow the conventions in `CONTRIBUTING.md`.

## 14. AI Attribution & Transparency

- The project was built with AI assistance. Decisions are recorded in `docs/DECISIONS.md` and `docs/adr/`.
- The repo owner is the sole author; commits carry no AI attribution trailers.

## 15. Verification Checklist

- [ ] Build passes (`bun run build`)
- [ ] Curated artifact builds (`bun run build:pages`) with 89 files and contains no forbidden path
- [ ] `_site` SHA-256 manifest recorded with the release SHA and deployment ID
- [ ] Post-deploy probe passes on the preview host (72 checks) and on production
- [ ] Public mirror has one commit, the release tag and a 239-file tree (after publish)
- [ ] Typecheck passes (both tsconfigs)
- [ ] Full Playwright suite passes (3 browser projects; 894 listed tests, latest full chromium 297 passed / 1 skipped)
- [ ] i18n parity gate passes
- [ ] WASM drift gate passes
- [ ] gitleaks finds no secrets
- [ ] Every F-### feature in `docs/FEATURES.md` is implemented and tested
- [ ] No prohibited patterns (as any, @ts-ignore, empty catch) in production code
- [ ] No-upload privacy rule verified
