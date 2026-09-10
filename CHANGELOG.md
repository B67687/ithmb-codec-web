# Changelog

## [Unreleased]

## [1.4.18] - 2026-09-10

Decoder WASM rebuilt from ithmb-core 1.9.10 (public tag v1.9.10, tree-verified identical to dev).

### Added

- **Scroll to top on page refresh**: page always starts at top when loaded or refreshed (`history.scrollRestoration = "manual"`).
- **Biome formatter + CI gate**: `biome.json` (1.9.4, 2-space, 100-col) with a format-only CI gate and local `format:check`; recommended lint stays unenforced.
- **Test strategy spec**: `docs/TEST_STRATEGY.md` freezes test tiers, time budgets, and the bug-link rule.
- **Fail-closed audit gate**: `scripts/check-audit.mts` restores fail-on-findings semantics (`bun audit` exits 0 with advisories).
- **Bun package manager**: `bun.lock` replaces `package-lock.json`; installs via `bun install --frozen-lockfile`.

### Changed

- **Worker fetch handler split**: monolithic 757-line fetch handler split into focused functions (`handleOptions`, `handleDashboardGet`, `handlePostIngestion`, `validateEntry`, `persistRecord`).
- **Filmstrip module extracted** from `viewer.ts` (69 LOC).
- **Report modal extracted** from `share-actions.ts` (183 LOC).
- **Shared `tsconfig.base.json`** extracted for consistent TypeScript strictness.
- **Runtime migration to bun 1.3.14**: npm scripts run on bun (build, i18n, worker, journey); unit tests vitest → `bun test` (69/69); `tsconfig.node.json` types add bun via `@types/bun`.
- **TypeScript strictness**: `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess` enabled (37 errors → 0 with explicit guards).
- **Docs maintenance diet**: README scripts table trimmed to essentials, CI gate matrix single-sourced in ARCHITECTURE.md, Plugin README drops LOC tables and duplicate indexes.

### Fixed

- **Telemetry worker**: returns 400 (not 500) for malformed JSON in POST handler.
- **Test fixtures**: corrupt-fixture test writes to tmpdir instead of checked-in path.
- **Missing decoder i18n keys**: `decoder.decodeFailed`/`decoder.unknownFormat` rendered literally in the UI; added with failure-path tests.
- **styles.css stray lines**: 3 dead declarations outside any rule (edit leftover, browsers ignored, Biome unparseable); removed.
- **EMBEDDED_EN formatter corruption**: Biome single-quoted HTML-bearing locale values, breaking the i18n JSON.parse gate; `biome-ignore format` + regen.
- **CI bun cache**: `setup-node` rejects `cache: bun`; explicit `actions/cache` on `~/.bun/install/cache` keyed by `bun.lock`.
- **W1 perf budgets + W2 a11y**: Playwright perf-budget spec; zh-mirror + post-upload axe coverage (missing aria-labels, enterprise link).

### Security

- **qs advisories waived (QS-01)**: 2 moderates via the dev-only http-server chain (identical pins under npm); 6.16.0 bump clears nothing. Explicit exact-match waiver in `scripts/check-audit.mts`, fails closed on anything else.

## [1.4.17] - 2026-08-13

### Added

- **Progressive display** (`ithmb-decoder/ui.ts`): when multiple files are dropped, decoding now proceeds in waves of 4 with a macrotask yield (`setTimeout 0`) between waves, so thumbnails appear as they decode instead of flashing in all at once. The viewer still opens immediately on the first card.

### Changed

- **Wasm regenerated from ithmb-core 1.9.6**: ships the Nano 7G cover-art alternates (1013/1015/1016), the reordered RGB555 encoder endianness fix, the profile-1044 disable (53 active profiles), and the `swaps_dimensions` encoder fix. Wasm cache-bust bumped to `?v=1.9.6`.

### Fixed

- **Pre-commit hook repaired for the TypeScript codebase**: `.husky/pre-commit` now runs the TS toolchain (`tsx scripts/check-i18n.mts`), the wasm-drift check, and the Playwright smoke specs against a local http-server, matching CI.

## 1.4.16 — 2026-08-06

### Added

- **Language-preference redirect** (`lang-redirect.js`): a synchronous classic script loaded in `<head>` of all 8 content pages before first paint. Reads `localStorage ithmbLang` and redirects to the counterpart page in the stored language; with no stored preference, zh `navigator.language` browsers land on `/zh/` by default. `/zh/` pages never bounce back to English; unmapped paths like `/404.html` are untouched; relative targets work on local dev servers.
- **Server-rendered `/zh/` page tree** (canonical Chinese URLs): `/zh/`, `/zh/ithmb-decoder/`, `/zh/guide/how-to-open-ithmb-files`, `/zh/enterprise/` are now statically rendered Chinese HTML, replacing the old `?lang=` client-side swap scheme. Nav links, hreflang alternates, and sitemap entries all point at the real `/zh/` URLs.
- zh URLs added to `sitemap.xml`.

### Changed

- **Language switcher is now a plain navigation link** between EN and `/zh/` counterparts (no more in-page text swap); its click handler writes the target language to `localStorage ithmbLang` before navigating, the only writer of the preference.
- **Server-rendered `<html lang>` is authoritative** (EN and zh): i18n init adopts the forced language without applying embedded English over the served HTML, then activates real translations when the locale fetch lands.
- Legacy `.html` URLs canonicalized via `_redirects` (guide pages).

### Removed

- **Cross-tab language sync** (all open tabs following the toggle): the `storage` event listener and `applySyncedLang()` are gone. Dropped as a low-value QoL feature after the switcher became a plain link.

### Fixed

- **No English flash on refreshed `/zh/` pages**: the init path no longer applies `EMBEDDED_EN` over the already-Chinese server HTML while the zh.json fetch is in flight.
- **Decoder hardened against photodb infinite loops / JPEG peak budget exhaustion** (core `1.9.5`, CWE-835/400): the regenerated `ithmb_wasm_bg.wasm` ships the infinite-loop guard and JPEG peak-memory budget fix from the 1.9.5 core release.

### Tests

- `seo-metadata.spec.js` gains a **"language preference redirect"** block (7 tests: stored zh/en preference redirects both ways, no-preference browser-language rules, never-bounce, unmapped paths); the old "EN description stays English despite a zh stored preference" test was replaced by redirect coverage. Suite is 106 tests on chromium.

## 1.4.15 — 2026-08-05

### Tests

- Updated the footer visual-regression baseline to include the Enterprise footer link (1.4.12's intentional footer change; the committed baseline predated it, which is why CI's test job was red).
  — 2026-08-05

### Security (privacy)

- **Per-IP pseudonyms are now HMAC-keyed (C4, real fix — not just documentation).** The plain SHA-256 truncation was trivially reversible for IPv4 (2^32 space), so anyone with KV read access could recover every submitter's raw IP — a broken privacy promise for a privacy-first product. Per-IP keys and the stored record fingerprint are now HMAC-SHA256 keyed with a server secret (`IP_HMAC_SECRET`, falling back to `ADMIN_TOKEN`; set in the CF dashboard), making them cryptographically irreversible without the secret; truncation extended 64→128 bits so cross-IP collisions are negligible. A KV dump/backup/leak now reveals nothing.
  — 2026-08-05

### Security

- **Rate markers now cover every accepted POST** (C2): the markers were written only on _stored_ requests, so dedup'd/invalid resubmissions could replay forever without consuming the 100/500-per-day budget. Markers are written right after the rate check, before dedup/validation early-returns; the batch path's stored-only marker was removed; batch dedup keys now match the single path's `:h`/`:f` suffix (the divergent namespaces allowed duplicate storage).
- **Public `GET /` scan bounded** (C3): the unauthenticated JSON endpoint paginated the entire `fmt_` namespace (only the dashboard had the 5000 cap) — now capped at 5000 like the dashboard.
- **Privacy doc honesty** (C4): per-IP keys use a truncated SHA-256 — a pseudonym, not a secret; IPv4 is brute-forceable by a KV reader. Documented in the worker README.

### Docs

- Recency sweep (final security-research pass): worker README statuses/payload/dedup fixed; FEATURES.md §7.1 (processedCount removed, 14 modules) + self-correcting-cap wording; AGENTS.md devDeps + route + canonical test path; duplicate CHANGELOG H1 removed.
- Worker test extended to 11 checks (C2 rate-marker regression: N POSTs → N markers).
  — 2026-08-05

### Docs

- Dev/public release workflow is now defined ONCE in the canonical `docs/standards/RELEASE_WORKFLOW.md` (Rust repo); AGENTS.md + FEATURES.md here link to it instead of carrying their own drifted copy.

## 1.4.11 — 2026-08-05 — 2026-08-05

### Fixed

- Enterprise is now reachable from a low-key **footer link** (kept out of the topbar, which stays Home | Decoder | Guide — the site's identity is a free/private tool, and the enterprise page is an under-construction commercial side-door; buyers find it via the home card or footer).

## 1.4.10 — 2026-08-05

### Tests

- Telemetry worker now has a **committed integration test** (`workers/telemetry/test-worker.mjs`, `npm run test:worker`): runs the worker inside miniflare/workerd with in-memory KV — 10 checks covering valid/garbage-base64 POSTs, Bearer-only auth, no raw IP in KV keys, `fullfile_` payload separation, uuid record keys, key-name-derived public JSON. Replaces the flaky bash smoke script (SQLite WAL checkpoint races).

### Dependencies

- Added `miniflare` as a devDependency (test-only; runtime remains zero-dep).

## 1.4.9 — 2026-08-05

### Architecture

- Decode-result lists (`successfulDecodes`/`failedDecodes`) are now owned by a single `cards.js` module (addSuccess/addFailure/resetCards + read-only query accessors) instead of plain exported arrays every module mutated — closes the "shared mutable arrays" seam documented in FEATURES.md §12. `resetCards()` replaces the duplicated length-reset in the first-batch path.

## 1.4.8 — 2026-08-05

### Docs

- Rewrote `docs/FEATURES.md` — it had drifted far from the code (stale worker auth, missing report modal, outdated tests/CI/deploy sections, pre-1.4.7 i18n behavior). Now the canonical feature + architecture spec, including a "Known Seams" section documenting the fragile architecture points (i18n activation race, re-render vs in-flight ops, shared mutable arrays) so future problems are attributable.

### Fixed

- Removed a duplicate `failedDecodes.length = 0` dead line in the first-batch reset (a symptom of the shared-array seam).

## 1.4.7 — 2026-08-05

### Fixed

- View-toggle button label now renders in the default language on first load (was stuck on the static English text when Chinese was the browser default). Root cause was an i18n initialization race: `languagechange` fires from i18n.js's module top-level before app.js registers its listener. The label is now derived from viewer state inside `updateToolbar()`, which runs on every state change — one mechanism instead of an event that can't cover the module-load race.

## 1.4.6 — 2026-08-05

### Tooling

- Dropped dependabot (its PRs would open directly on the public repo, bypassing the dev-first workflow) — dependency upgrades are now a local check: `npm run check:deps` (audit + outdated). Tree parity between dev and public is restored.

## 1.4.5 — 2026-08-05

### Fixed

- Guide-page tests now target the canonical `.html` URL (`/guide/how-to-open-ithmb-files.html`) — the extensionless path only resolved on Python 3.14+, breaking the new CI on stock runners

## 1.4.4 — 2026-08-04

### Tooling

- Added GitHub CI (`.github/workflows/ci.yml`): lint gates (acorn + i18n) + wasm drift check + Playwright chromium + gitleaks secrets scan — runs on the public repo where Actions minutes are free
- Pre-commit hook now forces `BASE_URL` to a local server (it was silently testing the live production site) and runs the new wasm drift check
- New `scripts/check-wasm-drift.sh`: fails if the committed wasm's imports drift from the hand-adapted loader glue (the wasm/loader breakage class)
- `dependabot.yml` (npm + GitHub Actions)
- New `AGENTS.md` onboarding guide: build/test/deploy, wasm regeneration pipeline, dev/public dual-repo workflow, security posture, release process
- Removed the dangling `@ts-self-types` directive (the referenced `ithmb_wasm.d.ts` doesn't exist)

## 1.4.3 — 2026-08-04

### Fixed

- Load-failed fallback now offers a **Retry** button (re-runs wasm init) — a transient fetch failure recovers in place instead of stranding the user on the error message

## 1.4.2 — 2026-08-04

### Added

- Localized og:title / og:description (meta tags follow the active language)
- `npm run ci` now gates on `lint:modules` + `lint:i18n` before the test run

### Fixed

- "Decoding…" placeholder now re-translates if you switch language mid-decode
- Footer no longer flashes raw translation keys on pages where i18n loads late
- Report modal backdrop listener bound once (was accumulating one per click)
- Toast hide timer resets on each new toast (rapid messages no longer cut short)
- Share POST timeout now scales with payload size (8s + 1s/MiB, capped 30s) — large full-file uploads over slow connections no longer always time out
- Duplicate aria-labels and duplicate/dead lines removed

## 1.4.1 — 2026-08-04

### Security

- Block stored XSS in the telemetry dashboard: every record field HTML-escaped, CSP `default-src 'none'` + `frame-ancestors 'none'` + `nosniff`, non-hex header values rejected
- Hardened the telemetry worker against abuse: race-free per-day record/rate caps (list-based counters — the old read-then-write counters were permanently bypassable under concurrency), per-IP counter keys hashed (raw IP no longer written to KV), bounded dashboard scan + full-file payloads moved to separate keys (renders never fetch multi-MB values), byte-accurate body cap + base64-validated full-file uploads, Bearer-only constant-time dashboard auth, `no-store` + `no-referrer` headers
- Cap embedded-JPEG dimensions before decode (a 166-byte progressive JPEG declaring 65535×65535 triggered an ~8 GiB allocation and SIGABRT — CWE-400); browser wasm rebuilt with the fix
- Client hardening: ZIP entry names sanitized + deduped, i18n interpolation params HTML-escaped

### Fixed

- Error cards no longer pushed into the shareable set (broke re-render after a language switch)
- Share-box rollback re-queries live buttons — a mid-POST language switch no longer strands the UI at "Shared ✓"
- View-toggle button label now follows the viewer state after a language switch

## 1.4.0 — 2026-08-04

### Added

- Full i18n: Simplified Chinese + English across the decoder, home, guide, 404, and enterprise pages — EN/中 nav toggle, auto-detect (browser language / ?lang= / saved choice), instant in-memory language switch, and cross-tab sync (all open tabs follow the toggle)
- Culture-fit localization: native Chinese dev-site voice (请我喝杯奶茶 sponsor, 由 Ithmb-Codec 驱动 footer, 免费 · 本地 · 无追踪 tagline, 页面飞走了 🕊️ 404, 给个 ⭐ star invite, 分享 not 共享) — five independent QA passes
- Restored report/contribute modal: shared centered dialog (dimmed + blurred backdrop) with the decoded-image thumbnail, plain-language issue picker, and honest submit — from any card or the viewer stage
- SEO: localized meta descriptions, hreflang en/zh alternates, Content-Security-Policy on the 404 page, SEO metadata regression suite
- Brand-last page titles ("Page | ITHMB Codec")

### Changed

- Share/report UI is optimistic (instant feedback, background POST, honest rollback on failure)
- Decode-failed styling standardized to orange across file cards, viewer placeholder, and filmstrip
- Modal/buttons/radii unified to consistent tiers; removed dead code
- 30-squashed-commit architecture cleanup: single mechanisms for toggle, swipe, viewer refresh, i18n activation; EMBEDDED_EN single-source with drift gate

### Fixed

- Share buttons lied when a request hung — added an 8s timeout so a failed send rolls back and toasts honestly
- Language-switch "seizure" (rapid en↔zh flicker across tabs) — write-amplification loop fixed at the root
- Report form closing on language switch; form now survives re-renders
- Warning-triangle glyph rendering differently per language (now identical SVG)
- Locale tables were never tracked in git (deployed site had no translations); footer suffix key leaking raw into EN

## 1.3.0 — 2026-08-02

### Added

- Static decoder mockup in the guide (toolbar, viewer, filmstrip, grid) using native-resolution synthetic test images — sharp at any zoom, no screenshots
- Brand logo on the README (padded square mark) and enterprise page
- Fixed-height gallery stage so the viewer no longer resizes when navigating between differently-sized images
- Regression test locking the fixed-stage behavior

### Changed

- Guide privacy wording to match the opt-in sharing model ("Nothing gets uploaded unless you click Share")
- Home meta/og description: accurate privacy claim
- README issue link now points at the Rust codec repo

### Fixed

- Missing closing tags on home meta/og description broke the favicon link
- Gallery viewer resizing abruptly between images of different sizes

## 1.2.0 — 2026-08-01

### Added

- SEO structured data: HowTo + FAQPage schema on the guide, BreadcrumbList on home/decoder/guide
- Cross-platform note in the guide (Windows, macOS, Linux, mobile)
- "Try it live" CTA + guide link in the README

### Fixed

- Stray `/>` rendering in the guide head
- Guide link check (dead/bot-blocked URLs excluded)

## 1.1.0 — 2026-07-30

### Added

- Cross-browser test suite: Chromium + Firefox (196 tests)
- Visual regression snapshots for all pages (Chromium + Firefox)
- aria-live on batch modal countdown timer (screen readers)
- Download All info tooltip (count + format on hover)

### Changed

- Batch modal: timer + confirm message stack vertically (not flex)
- Batch toggle label shortened to Share data, placed inline
- Toolbar: all buttons same height (btn-small)
- Toolbar: grid/gallery button fixed width (no resize on toggle)
- Download All: removed bracket count, added title tooltip
- View toggle button text centered
- Logo: SVG owns its own blue box (no CSS background overlap)
- Logo: better spacing, proper nav-bar-like proportions
- Guide page: clarified privacy claim (opt-in contribution)
- All pages: styles.css cache-busted with ?v=1

### Fixed

- Drag-and-drop broken by duplicate import
- Batch toggle padding not matching button height
- Format select padding mismatched
- viewer-nav button font-size overriding btn-small
- viewerPos span missing vertical padding
- Firefox viewer buttons navigating by DOM order
- Duplicate Contributed alert on batch checkbox uncheck
- Stale CSS served from http-server cache

## 1.0.0 — 2026-07-28

### Added

- Initial public release of ITHMB Codec Web
- Browser-based .ithmb decoder using WebAssembly
- Drag-and-drop file processing with batch support
- Individual and batch ZIP download (JPEG, PNG, BMP, WebP)
- Format contribution system with privacy-first telemetry
- Guide page with FAQ and documentation
- Open source release (MIT license)
- CI/CD pipeline with Playwright test suite
- Visual regression testing (8 snapshot baselines)
- FAQ schema, XML sitemap, Google Search Console integration

[1.4.17]: https://github.com/B67687/Ithmb-Codec-Web-Dev/compare/v1.4.16...v1.4.17
