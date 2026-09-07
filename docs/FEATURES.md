# FEATURES.md: Standing Feature & Behavior Inventory

> **Living artifact (mandated).** The project's complete reference of intended + confirmed features and how each is supposed to behave. It is the differential against which both problem-detection ("what deviated from intent?") and testing ("what should we prove?") are measured.
>
> **Backfill note:** this inventory was created at the REVIEW gate (August 2026) for a codebase that shipped before the inventory discipline landed. Every feature below is `applied` (implemented, tested, spec-synced). Tests anchor to features via the Test Anchoring tables; per-test F-### tags are the forward convention.

## Lifecycle

```
proposed -> approved -> applied -> archived
```

| Status     | Meaning                                    | Can be shipped?     |
| ---------- | ------------------------------------------ | ------------------- |
| `proposed` | Intended, not yet ratified into V1         | No                  |
| `approved` | In V1 scope (IN SCOPE, RULES section 5)    | No: needs `applied` |
| `applied`  | Implemented, tests anchored, spec-synced   | Yes                 |
| `archived` | Removed/superseded; entry kept for history | No                  |

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Shared Components](#2-shared-components)
3. [Home Page](#3-home-page)
4. [Decoder Page](#4-decoder-page)
5. [Guide Page](#5-guide-page)
6. [Enterprise Page](#6-enterprise-page)
7. [Internal JS Behaviors](#7-internal-js-behaviors)
8. [i18n Architecture](#8-i18n-architecture)
9. [CSS Design System](#9-css-design-system)
10. [Telemetry Worker](#10-telemetry-worker)
11. [Testing, CI & Deployment](#11-testing-ci--deployment)
12. [Meta-Architecture: Known Seams](#12-meta-architecture-known-seams)

---

## 1. Architecture Overview

### File Structure

```
ithmb-codec-web/
├── index.html                         # Home page (entry)
├── nav.js                             # Shared navigation (IIFE, insertAdjacentHTML)
├── footer.js                          # Shared footer (IIFE — renders ONLY after window.t exists, no raw-key flash)
├── lang-redirect.js                   # Pre-paint locale redirect (stored pref / zh browser → /zh/ counterpart)
├── bmc-icon.svg / favicon.svg / thumb-decoder-preview.png
├── CNAME                              # Custom domain: ithmb-codec.dev
├── package.json                       # Zero runtime deps; bun 1.3.14 (scripts, unit tests); dev: @playwright/test, playwright
├── biome.json                         # Biome 1.9.4 format gate (2-space, 100-col); recommended lint unenforced
├── playwright.config.ts               # 3 projects (chromium, firefox, webkit); baseURL = BASE_URL || live site
├── AGENTS.md                          # Agent onboarding (build/test/deploy/wasm-regen/dev-public workflow)
│
├── ithmb-decoder/                     # Core web app (decoder)
│   ├── index.html                     # Decoder page (entry)
│   ├── styles.css                     # Shared CSS (all pages)
│   ├── app.js                         # Main entry (ES module, top-level await, retry on wasm init failure)
│   ├── decoder.js                     # decodeFile: wasm call → success/failure dispatch (error cards NOT persisted)
│   ├── viewer.js                      # Viewer + toolbar (updateToolbar derives state-dependent labels)
│   ├── state.js                       # S singleton + shared arrays
│   ├── ui.js                          # processFiles, file cards, batch/dedup
│   ├── utils.js                       # bytesToHex/Base64, formatSize, showToast (timer reset), escapeHtml
│   ├── input.js                       # Hold-to-repeat (400ms grace → 30ms interval)
│   ├── telemetry.js                   # submitTelemetry (payload-aware timeout: 8s + 1s/MiB, cap 30s)
│   ├── download.js                    # Download All ZIP (entry names sanitized + deduped)
│   ├── i18n.js                        # en/zh tables, EMBEDDED_EN fallback, setLang, languagechange event
│   ├── share-actions.js               # Share box + SHARED report modal (#reportModal, backdrop bound once)
│   ├── card-success-ui.js             # Success card: info panel + report link (no share box)
│   ├── cards.js                        # SINGLE OWNER of decode-result lists (addSuccess/addFailure/reset/query)
│   ├── locales/{en,zh}.json           # Translation tables (flat keys; sync-embedded.mjs regenerates EMBEDDED_EN)
│   ├── ithmb_wasm.js                  # HAND-ADAPTED loader (streaming instantiation) — do NOT replace
│   ├── ithmb_wasm_bg.js               # GENERATED wasm-bindgen glue (reformatted) — pairs with the loader
│   └── ithmb_wasm_bg.wasm             # GENERATED decoder binary (~194 KB) — copied from Ithmb-Codec
│
├── guide/how-to-open-ithmb-files.html # Documentation page
├── enterprise/index.html              # Enterprise marketing page
├── workers/telemetry/                 # Cloudflare Worker (see its README for deploy)
│   └── src/
│       ├── worker.ts                  # Thin router (CORS, dashboard, POST)
│       ├── types.ts                   # Env, StoredRecord, constants
│       ├── crypto.ts                  # HMAC-SHA256, fingerprints, escapeHtml
│       ├── dashboard.ts               # HTML dashboard template
│       ├── validation.ts              # Entry field validation
│       └── persistence.ts             # KV writes, dedup, rate limits
├── scripts/
│   ├── build.mts                      # TS → JS build (deterministic)
│   ├── check-local.sh                 # Full local CI (10 gates)
│   ├── check-i18n.mts                 # i18n integrity gate (key parity, raw literals, EMBEDDED_EN drift)
│   ├── check-mirror-parity.mts        # Mirror parity guard
│   ├── sync-embedded.mts              # Regenerates EMBEDDED_EN in i18n.js from en.json
│   ├── check-wasm-drift.sh            # Committed wasm imports must all be handled by the loader glue
│   └── real-user-journey.mts          # Manual smoke script
├── tests/                             # Playwright specs + unit tests (see §11)
│   ├── *.spec.ts                      # 11 Playwright integration specs
│   └── unit/*.test.ts                 # Vitest unit tests (pure logic)
└── docs/FEATURES.md                   # THIS FILE
```

### Page Matrix

| Page       | Route                                 | Purpose        | Type                         | JS Required                                              |
| ---------- | ------------------------------------- | -------------- | ---------------------------- | -------------------------------------------------------- |
| Home       | `/`                                   | Landing page   | Static + CSS                 | nav.js, footer.js, lang-redirect.js                      |
| Decoder    | `/ithmb-decoder/`                     | Core web app   | Full SPA (ES modules + WASM) | nav.js, footer.js, app.js (14 modules), lang-redirect.js |
| Guide      | `/guide/how-to-open-ithmb-files.html` | Documentation  | Static + CSS                 | nav.js, footer.js, lang-redirect.js                      |
| Enterprise | `/enterprise/`                        | Marketing page | Static + CSS                 | nav.js, footer.js, lang-redirect.js                      |

### Dependency Direction (module graph)

```
app.js ──→ viewer.js ──→ state.js
   │            │
   ├── ui.js ───┘
   └── decoder.js ←── state.js (S, arrays, Set)
         │
         └── utils.js (size, toast, hex, escape)
share-actions.js ──→ telemetry.js ──→ state.js (TELEMETRY_URL)
card-success-ui.js / card-failure-ui.js ──→ share-actions.js + telemetry.js
i18n.js ──(languagechange event, no imports)──→ consumed by every module
```

i18n.js is dependency-free: other modules import `{ t }` from it; re-renders are driven by the `languagechange` DOM event it dispatches.

---

## 2. Shared Components

### F-001: Navigation Bar (`nav.js`)

- **Status:** applied
- **Reviewed:** 2026-08-27

**Behavior Contract:** Preconditions: any page with `<body>` element. Postconditions: IIFE injected as first child of `<body>` via `insertAdjacentHTML`; fixed top nav (44px, backdrop blur); brand left, 3 links center, icons right (language switcher + BMC + GitHub corner). Active link from `window.location.pathname` (zh prefix stripped). Invariants: nav renders before i18n.js; language switcher is a plain `<a>` link (not in-page toggle); click writes target to `localStorage ithmbLang` before navigating. Error cases: none (pure DOM insertion).

**Test Anchoring:**

| Test file / name                                                         | Covers                    |
| ------------------------------------------------------------------------ | ------------------------- |
| `tests/pages.spec.ts` — "loads and shows ITHMB title"                    | Nav renders on home page  |
| `tests/ithmb-decoder.spec.ts` — "GitHub corner exists"                   | GitHub corner positioning |
| `tests/ithmb-decoder.spec.ts` — "BMC corner exists"                      | BMC corner positioning    |
| `tests/visual.spec.ts` — "nav — home (active: Home, brand logo present)" | Nav visual snapshot       |
| `tests/visual.spec.ts` — "nav — decoder (active: Decoder)"               | Nav visual snapshot       |
| `tests/visual.spec.ts` — "nav — guide (active: Guide)"                   | Nav visual snapshot       |
| `tests/visual.spec.ts` — "nav — enterprise (active: Enterprise)"         | Nav visual snapshot       |

### F-002: Footer (`footer.js`)

- **Status:** applied
- **Reviewed:** 2026-08-27

**Behavior Contract:** Preconditions: page with `<script>` position for injection. Postconditions: IIFE injected at script position; GitHub icon + "Powered by Ithmb-Codec" + Buy me a coffee. Invariants: renders only after `window.t` exists (no raw-key flash); re-renders via interval once ready. Error cases: none (graceful no-render if `window.t` absent).

**Test Anchoring:**

| Test file / name                                                    | Covers                 |
| ------------------------------------------------------------------- | ---------------------- |
| `tests/gallery.spec.ts` — "footer has GitHub and BMC links"         | Footer content         |
| `tests/visual.spec.ts` — "footer — enterprise page"                 | Footer visual snapshot |
| `tests/ithmb-decoder.spec.ts` — "mentions 'Powered by Ithmb-Codec'" | Footer text            |

---

## 3. Home Page

### F-003: Home Page (`index.html`)

- **Status:** applied
- **Reviewed:** 2026-08-27

**Behavior Contract:** Preconditions: none (landing page). Postconditions: title "ITHMB Codec", canonical, OG image, favicon, Inter fonts, FAQPage + WebApplication JSON-LD; og:title/og:description localized via `data-i18n-content`; logo, subtitle, three cards (Decoder/Guide/Enterprise) with hover states; responsive at 768px / 480px breakpoints. Invariants: EN subtitle horizontally centered; zh subtitle horizontally centered. Error cases: none (static page).

**Test Anchoring:**

| Test file / name                                                            | Covers           |
| --------------------------------------------------------------------------- | ---------------- |
| `tests/pages.spec.ts` — "loads and shows ITHMB title"                       | Title, structure |
| `tests/pages.spec.ts` — "has links to decoder and enterprise"               | Card links       |
| `tests/pages.spec.ts` — "EN subtitle is horizontally centered"              | Layout           |
| `tests/pages.spec.ts` — "zh subtitle is horizontally centered"              | zh layout        |
| `tests/visual.spec.ts` — "home page — full page"                            | Visual snapshot  |
| `tests/seo-metadata.spec.ts` — "has a meta description"                     | Meta tag         |
| `tests/a11y.spec.ts` — "home page has no critical accessibility violations" | a11y scan        |

---

## 4. Decoder Page

### F-004: Decoder Page Structure

- **Status:** applied
- **Reviewed:** 2026-08-27

**Behavior Contract:** Preconditions: none (decoder entry). Postconditions: title "ITHMB Decoder | ITHMB Codec", canonical, JSZip 3.10.1 (cdnjs, with SRI), entry `app.js` (ES module, top-level await); drop overlay, dropzone, toolbar (hidden init), help button, viewer nav, grid toggle, download all, format select, viewer container, file list, toast, report modal all present. Invariants: `--bg` is #f5f5f7; `--accent` is #007AFF; `--surface` is #fff; no batch toggle exists. Error cases: none (static structure).

**Test Anchoring:**

| Test file / name                                                                  | Covers        |
| --------------------------------------------------------------------------------- | ------------- |
| `tests/ithmb-decoder.spec.ts` — "loads without console errors"                    | Clean load    |
| `tests/ithmb-decoder.spec.ts` — "has correct title"                               | Title         |
| `tests/ithmb-decoder.spec.ts` — "dropzone is present with correct styling"        | Dropzone      |
| `tests/ithmb-decoder.spec.ts` — "#toolbar element exists and is initially hidden" | Toolbar       |
| `tests/ithmb-decoder.spec.ts` — "no batch-share checkbox exists in toolbar"       | Batch removal |
| `tests/ithmb-decoder.spec.ts` — "--bg is #f5f5f7"                                 | CSS variable  |
| `tests/ithmb-decoder.spec.ts` — "--accent is #007AFF"                             | CSS variable  |
| `tests/ithmb-decoder.spec.ts` — "--surface is #fff"                               | CSS variable  |

### F-005: Decoder App States

- **Status:** applied
- **Reviewed:** 2026-08-27

**Behavior Contract:** Preconditions: decoder page loaded. Postconditions: transitions through Initial → Processing → Progressive display → Decode success/failure/unknown/error → Viewer open → Grid mode. Invariants: cards appear in waves of 4 (setTimeout(0) yield between waves); wasm decode_ithmb is synchronous; error cards NOT persisted to failedDecodes. Error cases: init failure shows red message + Retry button.

**Test Anchoring:**

| Test file / name                                                          | Covers                 |
| ------------------------------------------------------------------------- | ---------------------- |
| `tests/stress.spec.ts` — "1: Drop zone rejects invalid files"             | Invalid file rejection |
| `tests/stress.spec.ts` — "2: Drop single file — viewer opens"             | Single file state      |
| `tests/stress.spec.ts` — "3: Drop 8 files — filmstrip has 8 thumbnails"   | Multi-file state       |
| `tests/stress.spec.ts` — "6: Toggle to grid mode and back"                | State transitions      |
| `tests/stress.spec.ts` — "9: Escape closes viewer"                        | Viewer close           |
| `tests/quality.spec.ts` — "corrupt .ithmb shows share card, not an error" | Error state            |

### F-006: File Drop/Upload Flow

- **Status:** applied
- **Reviewed:** 2026-08-27

**Behavior Contract:** Preconditions: decoder page loaded. Postconditions: drop or click → processFiles(files); first batch: full reset (fileList, counters, arrays, filmstrip, viewer closed); filter: .ithmb/.ipm extension, ≤ 8 MB, content-hash dedup; rejects → toast; card per valid file → decodeFile async; after each batch: updateToolbar(). Invariants: dedup by content hash + filename; only .ithmb/.ipm accepted. Error cases: invalid files produce toast + rejection.

**Test Anchoring:**

| Test file / name                                                                     | Covers        |
| ------------------------------------------------------------------------------------ | ------------- |
| `tests/upload.spec.ts` — "drops 8 distinct files — all decode successfully"          | 8-file batch  |
| `tests/upload.spec.ts` — "second batch of distinct files also decodes"               | Batch append  |
| `tests/upload.spec.ts` — "duplicate filenames — same file dropped 8 times"           | Dedup         |
| `tests/upload.spec.ts` — "drag overlay appears on dragenter and clears on dragleave" | Drag overlay  |
| `tests/upload.spec.ts` — "drop processes files and creates file cards"               | Card creation |
| `tests/stress.spec.ts` — "10: Same file deduplication"                               | Dedup stress  |
| `tests/stress.spec.ts` — "11: Multiple batches append correctly"                     | Multi-batch   |

### F-007: Decode Pipeline (`decodeFile`)

- **Status:** applied
- **Reviewed:** 2026-08-27

**Behavior Contract:** Preconditions: valid file input. Postconditions: read → Uint8Array → peek_prefix → decode_ithmb; success → canvas (600×400 max) → success card; failure (known/unknown) → failure card with share box; error (throws) → error card (message only, NOT pushed to failedDecodes). Invariants: error cards never stored (would break re-render's share-box creation); updateToolbar() called after each decode. Error cases: wasm throw → error card, no share box.

**Test Anchoring:**

| Test file / name                                                            | Covers             |
| --------------------------------------------------------------------------- | ------------------ |
| `tests/upload.spec.ts` — "drops 8 distinct files — all decode successfully" | Decode correctness |
| `tests/quality.spec.ts` — "corrupt .ithmb shows share card, not an error"   | Failure path       |
| `tests/quality.spec.ts` — "invalid file shows error toast"                  | Error path         |
| `tests/gallery.spec.ts` — "failed decode shows placeholder in viewer"       | Failure viewer     |

### F-008: Viewer

- **Status:** applied
- **Reviewed:** 2026-08-27

**Behavior Contract:** Preconditions: at least one file decoded. Postconditions: open on card click / first-batch auto-open; cyclic prev/next; ← → arrows + G key + Escape; touch swipe > 50px; filmstrip click; stage mirrors card via refreshViewerIfCurrent. Invariants: toolbar via updateToolbar() (called on open/close/process/languagechange); arrows hidden on mobile; filmstrip 80×60 thumbs with active accent. Error cases: none (graceful empty state).

**Test Anchoring:**

| Test file / name                                                                  | Covers           |
| --------------------------------------------------------------------------------- | ---------------- |
| `tests/gallery.spec.ts` — "viewer container appears with 8 files"                 | Open state       |
| `tests/gallery.spec.ts` — "first thumbnail is active when viewer opens"           | Initial state    |
| `tests/gallery.spec.ts` — "clicking a thumbnail switches the viewer"              | Click nav        |
| `tests/gallery.spec.ts` — "arrow keys navigate between images"                    | Keyboard nav     |
| `tests/gallery.spec.ts` — "Escape closes viewer"                                  | Close            |
| `tests/gallery.spec.ts` — "filmstrip thumbs appear in file order as placeholders" | Filmstrip order  |
| `tests/gallery.spec.ts` — "keyboard shortcut G toggles grid view"                 | G key toggle     |
| `tests/gallery.spec.ts` — "mobile viewport hides arrows and adapts filmstrip"     | Mobile           |
| `tests/gallery.spec.ts` — "holding ArrowRight advances viewer repeatedly"         | Hold-to-repeat   |
| `tests/gallery.spec.ts` — "viewer stage canvas has non-blank pixel content"       | Canvas content   |
| `tests/stress.spec.ts` — "5: Navigate by arrow keys (cyclic)"                     | Cyclic nav       |
| `tests/quality.spec.ts` — "arrow keys navigate between decoded images"            | Keyboard nav     |
| `tests/unit/client-utils.test.ts` — "KNOWN_PREFIXES contains expected entries"    | Prefix knowledge |

### F-009: Share / Report

- **Status:** applied
- **Reviewed:** 2026-08-27

**Behavior Contract:** Preconditions: at least one decoded file (success or failure). Postconditions: failure/unknown cards: share box = hex dump (first 16 bytes) + "Share 16 bytes" + "Share full file" (hidden above 8 MB); success cards: report link "Image looks wrong?" opens shared report modal. Invariants: nothing sent automatically; per-card dedup keys; sharedSubmissionIds dedup across re-renders; server rejection → honest failure toast + button rollback. Error cases: server rejection → toast, button stays active.

**Test Anchoring:**

| Test file / name                                                                             | Covers          |
| -------------------------------------------------------------------------------------------- | --------------- |
| `tests/quality.spec.ts` — "Share 16 bytes posts header-only payload and disables buttons"    | Header share    |
| `tests/quality.spec.ts` — "Share full file posts full_file base64 payload"                   | Full file share |
| `tests/quality.spec.ts` — "double-clicking Share 16 bytes sends exactly one POST"            | Dedup           |
| `tests/quality.spec.ts` — "sharing 16 bytes then full file sends both payloads"              | Upgrade flow    |
| `tests/quality.spec.ts` — "server rejection shows honest failure toast, button stays active" | Rollback        |
| `tests/quality.spec.ts` — "success card has no contribute button, shows report link"         | Success card    |
| `tests/quality.spec.ts` — "report link shares first 16 bytes and marks shared"               | Report flow     |
| `tests/quality.spec.ts` — "viewer stage shows share box for a failed card"                   | Viewer share    |
| `tests/quality.spec.ts` — "viewer stage report link posts header for a success card"         | Viewer report   |

### F-010: Download All

- **Status:** applied
- **Reviewed:** 2026-08-27

**Behavior Contract:** Preconditions: at least one successful decode. Postconditions: JSZip from all successful canvases; JPEG 92% (default) / PNG / BMP / WebP; global format select affects only ZIP (per-card S.cardFormats override); entry names sanitized ([\\/] → _, leading dots stripped) + deduped; filename `ithmb-pictures-converted-to-{format}.zip`. Invariants: per-card format not overridden by global select. Error cases: none (client-only).

**Test Anchoring:**

| Test file / name                                                                             | Covers             |
| -------------------------------------------------------------------------------------------- | ------------------ |
| `tests/gallery.spec.ts` — "download all creates a zip file"                                  | ZIP creation       |
| `tests/gallery.spec.ts` — "download format dropdown changes button text"                     | Format select      |
| `tests/gallery.spec.ts` — "global download-format select does not override per-card formats" | Per-card isolation |
| `tests/gallery.spec.ts` — "grid mode has format select in file cards"                        | Grid format select |

### F-011: Toast

- **Status:** applied
- **Reviewed:** 2026-08-27

**Behavior Contract:** Preconditions: any page with #toast element. Postconditions: showToast(msg) → role=status, aria-live=polite, 3s hide with timer reset (rapid messages don't cut each other short). Invariants: timer resets on each new toast. Error cases: none.

**Test Anchoring:**

| Test file / name                                                 | Covers          |
| ---------------------------------------------------------------- | --------------- |
| `tests/gallery.spec.ts` — "toast message appears and disappears" | Toast lifecycle |

### F-012: WASM Load-Failure Retry

- **Status:** applied
- **Reviewed:** 2026-08-27

**Behavior Contract:** Preconditions: decoder page loaded. Postconditions: init() throws → red message + Retry button; retry re-runs init(); transient failures recover in place; permanent failures re-enable button. Invariants: dropzone disabled during failure state. Error cases: wasm fetch failure → retry UX.

**Test Anchoring:**

| Test file / name                                              | Covers         |
| ------------------------------------------------------------- | -------------- |
| `tests/quality.spec.ts` — "invalid file shows error toast"    | Error handling |
| `tests/stress.spec.ts` — "1: Drop zone rejects invalid files" | Rejection flow |

---

## 5. Guide Page

### F-013: Guide Page (`guide/how-to-open-ithmb-files.html`)

- **Status:** applied
- **Reviewed:** 2026-08-27

**Behavior Contract:** Preconditions: none. Postconditions: title, canonical, Article JSON-LD, sections: What Is / How to Use / Why Use / About / FAQ / privacy bullet. Invariants: tests target the `.html` URL (extensionless path only resolves on Python 3.14+). Error cases: none (static page).

**Test Anchoring:**

| Test file / name                                           | Covers          |
| ---------------------------------------------------------- | --------------- |
| `tests/pages.spec.ts` — "loads with correct title" (guide) | Title           |
| `tests/pages.spec.ts` — "has FAQ heading" (guide)          | Content         |
| `tests/visual.spec.ts` — "guide page — full page"          | Visual snapshot |
| `tests/quality.spec.ts` — "guide page layout at 375px"     | Responsive      |
| `tests/seo-metadata.spec.ts` — "has a meta description"    | Meta tag        |

---

## 6. Enterprise Page

### F-014: Enterprise Page (`enterprise/`)

- **Status:** applied
- **Reviewed:** 2026-08-27

**Behavior Contract:** Preconditions: none. Postconditions: hero, differentiators, comparison table, pricing, FAQ; its own design system (hardcoded colors, not CSS variables — "under construction" page). Invariants: not using CSS custom properties (documented intentional). Error cases: none (static page).

**Test Anchoring:**

| Test file / name                                                | Covers          |
| --------------------------------------------------------------- | --------------- |
| `tests/pages.spec.ts` — "loads with correct title" (enterprise) | Title           |
| `tests/pages.spec.ts` — "has hero section" (enterprise)         | Structure       |
| `tests/visual.spec.ts` — "enterprise page — full page"          | Visual snapshot |

---

## 7. Internal JS Behaviors

### F-015: State Management (`state.js`)

- **Status:** applied
- **Reviewed:** 2026-08-27

**Behavior Contract:** Preconditions: decoder page loaded. Postconditions: mutable state object S with cardCount, globalCardIdCounter, viewerIndex, totalFiles, downloadFormat, cardFormats, lastTarget; decode-result lists owned by cards.js (single owner); processedFileIds Set (re-upload dedup); sharedSubmissionIds Set (share/report dedup). Invariants: read accessors return copies so callers can't mutate; TELEMETRY_URL constant; KNOWN_PREFIXES Set (~60 entries). Error cases: none.

**Test Anchoring:**

| Test file / name                                                                  | Covers        |
| --------------------------------------------------------------------------------- | ------------- |
| `tests/unit/client-utils.test.ts` — "KNOWN_PREFIXES contains expected entries"    | Prefix set    |
| `tests/unit/client-utils.test.ts` — "KNOWN_PREFIXES has correct size"             | Set integrity |
| `tests/unit/client-utils.test.ts` — "KNOWN_PREFIXES rejects non-prefixed numbers" | Negative case |

### F-016: Cards Module (`cards.js`)

- **Status:** applied
- **Reviewed:** 2026-08-27

**Behavior Contract:** Preconditions: decoder page loaded. Postconditions: single-owner arrays with addSuccess/addFailure/resetCards; read via successCards()/failedCards()/findSuccess()/findFailure()/successCount(). Invariants: read accessors return copies; error cards never stored. Error cases: none.

**Test Anchoring:**

| Test file / name                                                           | Covers          |
| -------------------------------------------------------------------------- | --------------- |
| `tests/upload.spec.ts` — "duplicate filenames — same file dropped 8 times" | Dedup via cards |
| `tests/stress.spec.ts` — "3: Drop 8 files — filmstrip has 8 thumbnails"    | Card count      |
| `tests/gallery.spec.ts` — "dropping same files twice deduplicates"         | Dedup flow      |

### F-017: Pure Utility Functions

- **Status:** applied
- **Reviewed:** 2026-08-27

**Behavior Contract:** Preconditions: none (pure functions). Postconditions: formatSize(bytes) → human-readable; bytesToHex(bytes) → hex string; bytesToBase64(bytes) → base64 string; formatLabels(prefix) → human-readable label; extMap[lookup] → extension. Invariants: output format consistent. Error cases: none (no side effects).

**Test Anchoring:**

| Test file / name                                                                   | Covers        |
| ---------------------------------------------------------------------------------- | ------------- |
| `tests/unit/client-utils.test.ts` — "formatSize formats bytes correctly" (3 cases) | formatSize    |
| `tests/unit/client-utils.test.ts` — "bytesToHex converts correctly" (4 cases)      | bytesToHex    |
| `tests/unit/client-utils.test.ts` — "bytesToBase64 converts correctly" (3 cases)   | bytesToBase64 |
| `tests/unit/client-utils.test.ts` — "formatLabels returns a non-empty string"      | formatLabels  |
| `tests/unit/client-utils.test.ts` — "extMap maps known prefixes"                   | extMap        |

### F-018: Decode Pipeline Unit Logic

- **Status:** applied
- **Reviewed:** 2026-08-27

**Behavior Contract:** Preconditions: file buffer. Postconditions: peek_prefix reads first 4 bytes; decode_ithmb calls wasm; dispatch success/failure/error. Invariants: synchronous wasm call. Error cases: wasm throw → error card.

**Test Anchoring:**

| Test file / name                                                                                | Covers            |
| ----------------------------------------------------------------------------------------------- | ----------------- |
| `tests/unit/worker-crypto.test.ts` — "escapeHtml escapes all HTML special characters" (5 cases) | HTML safety       |
| `tests/unit/worker-crypto.test.ts` — "validBase64Payload accepts valid base64" (5 cases)        | Base64 validation |
| `tests/unit/worker-crypto.test.ts` — "tokensEqual uses constant-time comparison" (3 cases)      | Timing safety     |
| `tests/unit/worker-crypto.test.ts` — "keyedPseudonym produces deterministic output" (4 cases)   | HMAC              |

---

## 8. i18n Architecture

### F-019: Declarative i18n (`data-i18n`)

- **Status:** applied
- **Reviewed:** 2026-08-27

**Behavior Contract:** Preconditions: page with `data-i18n` / `data-i18n-html` / `data-i18n-aria-label` / `data-i18n-content` attributes. Postconditions: applied by `applyTranslations()` on every element at language activation. Invariants: used for static, state-independent text; EMBEDDED_EN generated from locales/en.json; check-i18n.mts gates key parity. Error cases: missing key → raw key displayed.

**Test Anchoring:**

| Test file / name                                                                        | Covers         |
| --------------------------------------------------------------------------------------- | -------------- |
| `tests/seo-metadata.spec.ts` — "has a meta description"                                 | Localized meta |
| `tests/seo-metadata.spec.ts` — "${name}: en ↔ zh alternates with x-default"             | hreflang       |
| `tests/seo-metadata.spec.ts` — "${name}: fully Chinese HTML with real en ↔ zh hreflang" | zh hreflang    |

### F-020: Derived i18n (`t()`)

- **Status:** applied
- **Reviewed:** 2026-08-27

**Behavior Contract:** Preconditions: runtime state change. Postconditions: `t(key, params)` returns HTML-escaped text; state-derived text re-derived at every state change. Invariants: params are HTML-escaped; updateToolbar() pattern (derive at state change, not languagechange). Error cases: missing key → raw key.

**Test Anchoring:**

| Test file / name                                                                      | Covers        |
| ------------------------------------------------------------------------------------- | ------------- |
| `tests/gallery.spec.ts` — "toggle button text switches between Grid view and Gallery" | Derived label |
| `tests/gallery.spec.ts` — "download format dropdown changes button text"              | Format label  |

### F-021: Language-Preference Redirect (`lang-redirect.js`)

- **Status:** applied
- **Reviewed:** 2026-08-27

**Behavior Contract:** Preconditions: any page with `<html lang>` + localStorage. Postconditions: synchronous redirect before first paint; stored pref differs from page → replace to counterpart; zh navigator on EN page → redirect to /zh/. Invariants: /zh/ never bounces to EN (no loop); targets relative (works locally); location.replace() keeps redirect out of history. Error cases: unmapped paths (e.g. /404.html) untouched.

**Test Anchoring:**

| Test file / name                                                                                       | Covers            |
| ------------------------------------------------------------------------------------------------------ | ----------------- |
| `tests/seo-metadata.spec.ts` — "stored zh preference redirects an EN page to its /zh/ counterpart"     | zh redirect       |
| `tests/seo-metadata.spec.ts` — "stored en preference redirects a /zh/ page to its EN counterpart"      | en redirect       |
| `tests/seo-metadata.spec.ts` — "no preference + zh browser redirects an EN page to /zh/"               | Browser detection |
| `tests/seo-metadata.spec.ts` — "no preference + zh browser stays on a /zh/ page (never bounces to EN)" | No-loop           |
| `tests/seo-metadata.spec.ts` — "an unmapped path is never redirected (404 stays put)"                  | Unmapped          |
| `tests/seo-metadata.spec.ts` — "stored zh preference redirects the guide .html URL"                    | Guide redirect    |
| `tests/seo-metadata.spec.ts` — "no preference + non-zh browser keeps an EN page in place"              | No-op             |

---

## 9. CSS Design System

### F-022: CSS Custom Properties & Component Catalog

- **Status:** applied
- **Reviewed:** 2026-08-27

**Behavior Contract:** Preconditions: any page. Postconditions: CSS custom properties (--bg, --surface, --border, --text, --muted, --accent, --accent-hover, --success, --warn, --radius, --shadow, --card-bg); component catalog: buttons, dropzone, file cards, statuses, viewer, filmstrip, toolbar, toast, drop overlay, GitHub/BMC corners, back-to-top, share box, report link, viewer header, footer, :focus-visible outlines. Invariants: animations: spin (0.6s), placeholder-spin (0.8s); breakpoints 768px / 480px; dark mode intentionally not supported. Error cases: none.

**Test Anchoring:**

| Test file / name                                                                                  | Covers                                |
| ------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `tests/ithmb-decoder.spec.ts` — "body background is --bg CSS variable"                            | CSS vars                              |
| `tests/ithmb-decoder.spec.ts` — "dropzone is present with correct styling"                        | Component styling                     |
| `tests/dark-mode.spec.ts` — "dark mode: ${name} has no light-background or low-contrast elements" | Dark mode (documented: not supported) |
| `tests/quality.spec.ts` — "home page fits viewport at 375px (iPhone)"                             | Responsive                            |
| `tests/quality.spec.ts` — "decoder page layout at 375px (iPhone)"                                 | Responsive                            |

---

## 10. Telemetry Worker

### F-023: Telemetry Worker — Core (POST/GET/Dashboard)

- **Status:** applied
- **Reviewed:** 2026-08-27

**Behavior Contract:** Preconditions: Cloudflare Worker with KV binding. Postconditions: POST / (single record), GET / (public JSON: prefix counts from key names, zero value fetches), GET /dashboard (Bearer auth, HTML, bounded scan ≤ 5000 slim records), OPTIONS (CORS). Records: slim `fmt_<prefix>_<uuid>` + separate `fullfile_<uuid>` keys + `hasFullFile` flag + 365d TTL. Privacy: fingerprints SHA-256(IP:UA) truncated 8 bytes; per-IP keys hash IP alone (raw IP never stored). Rate/caps: 100 POSTs/day/fp, 500/day/ip, 50 records/day/fp, 250/day/ip; dedup 24h. Body: byte-accurate 13 MB cap; full_file ≤ 8 MB base64 decoded. Auth: Authorization: Bearer, constant-time (no ?token=). Dashboard: HTML-escaped fields, frame-ancestors 'none', Cache-Control: no-store. Invariants: Admin token set in CF dashboard, never in repo. Error cases: rate limit → 429; invalid body → 400; bad auth → 401.

**Test Anchoring:**

| Test file / name                                                                              | Covers            |
| --------------------------------------------------------------------------------------------- | ----------------- |
| `workers/telemetry/test-worker.ts` — "200 GET / returns JSON with prefix counts"              | GET JSON          |
| `workers/telemetry/test-worker.ts` — "POST / persists a record to KV"                         | POST persist      |
| `workers/telemetry/test-worker.ts` — "POST / dashboard renders HTML"                          | Dashboard         |
| `workers/telemetry/test-worker.ts` — "POST / with invalid JSON returns 400"                   | Error: bad body   |
| `workers/telemetry/test-worker.ts` — "POST / without auth returns 401"                        | Error: no auth    |
| `workers/telemetry/test-worker.ts` — "POST / with bad token returns 401"                      | Error: bad auth   |
| `workers/telemetry/test-worker.ts` — "POST / OPTIONS returns CORS headers"                    | CORS              |
| `workers/telemetry/test-worker.ts` — "POST / deduplicates records"                            | Dedup             |
| `workers/telemetry/test-worker.ts` — "POST / enforces rate limits"                            | Rate limit        |
| `workers/telemetry/test-worker.ts` — "POST / validates body size"                             | Body cap          |
| `workers/telemetry/test-worker.ts` — "GET / dashboard without auth returns 401"               | Dashboard auth    |
| `workers/telemetry/test-worker.ts` — "POST / full_file base64 stored separately"              | Full file storage |
| `tests/unit/worker-validation.test.ts` — "accepts valid entry with all fields" (15 cases)     | Validation logic  |
| `tests/unit/worker-crypto.test.ts` — "keyedPseudonym produces deterministic output" (4 cases) | HMAC-SHA256       |
| `tests/unit/worker-crypto.test.ts` — "fingerprint produces consistent hash"                   | Fingerprint       |
| `tests/unit/worker-crypto.test.ts` — "ipFingerprint produces consistent hash"                 | IP fingerprint    |

---

## 11. Testing, CI & Deployment

### F-024: Playwright Integration Suite

- **Status:** applied
- **Reviewed:** 2026-08-27

**Behavior Contract:** Preconditions: Playwright installed + BASE_URL set. Postconditions: 12 spec files covering pages, decoder, gallery, stress, upload, quality, a11y, seo-metadata, visual, dark-mode, decode-failure, perf-budget (tiers frozen in docs/TEST_STRATEGY.md) plus `tests/unit/port-regression.test.ts` in bun:test; 3 projects (chromium, firefox, webkit); test:quick = chromium only, test:full = all 3. Invariants: tests/hooks must always set BASE_URL to local server (never production). Error cases: any spec failure → non-zero exit.

**Test Anchoring:**

| Test file / name                                 | Covers                     |
| ------------------------------------------------ | -------------------------- |
| `tests/pages.spec.ts` — all tests                | Page load coverage         |
| `tests/ithmb-decoder.spec.ts` — all tests        | Decoder structure          |
| `tests/gallery.spec.ts` — all tests              | Viewer/gallery flows       |
| `tests/stress.spec.ts` — all tests               | Full-flow stress           |
| `tests/upload.spec.ts` — all tests               | Upload/decode              |
| `tests/quality.spec.ts` — all tests              | Share/report + responsive  |
| `tests/a11y.spec.ts` — all tests                 | Accessibility              |
| `tests/seo-metadata.spec.ts` — all tests         | SEO + i18n redirect        |
| `tests/visual.spec.ts` — all tests               | Visual snapshots           |
| `tests/dark-mode.spec.ts` — all tests            | Dark mode                  |
| `tests/unit/port-regression.test.ts` — all tests | Port allocation (bun:test) |

### F-025: Bun Unit Test Layer

- **Status:** applied
- **Reviewed:** 2026-08-27

**Behavior Contract:** Preconditions: bun 1.3.14 installed. Postconditions: tests/unit/*.test.ts covering pure logic (crypto, validation, client utils); bun run test:unit → bun test tests/unit/. Invariants: no DOM dependencies; fast (< 1s). Error cases: any test failure → non-zero exit.

**Test Anchoring:**

| Test file / name                                        | Covers                  |
| ------------------------------------------------------- | ----------------------- |
| `tests/unit/worker-crypto.test.ts` — all tests (14)     | Worker crypto logic     |
| `tests/unit/worker-validation.test.ts` — all tests (15) | Worker validation logic |
| `tests/unit/client-utils.test.ts` — all tests (19)      | Client pure utilities   |

### F-026: a11y Authoritative Gate

- **Status:** applied
- **Reviewed:** 2026-08-27

**Behavior Contract:** Preconditions: axe-core + Playwright installed. Postconditions: scans 5 pages with wcag2a/aa/21a/aa/best-practice tags; filters critical/serious violations; excludes KNOWN_A11Y_EXCLUSIONS (color-contrast); assertion fails CI on unexpected violations. Invariants: known intentional exclusions documented; test blocks on any new violation. Error cases: violation found → test failure.

**Test Anchoring:**

| Test file / name                                                               | Covers             |
| ------------------------------------------------------------------------------ | ------------------ |
| `tests/a11y.spec.ts` — "${name} page has no critical accessibility violations" | Authoritative a11y |

### F-027: Pre-commit & Local CI Gates

- **Status:** applied
- **Reviewed:** 2026-08-27

**Behavior Contract:** Preconditions: git hooks wired (`git config core.hooksPath .husky`). Postconditions: pre-commit → i18n gate + wasm-drift + smoke specs; check:local → 10 gates (audit, outdated, typecheck, unit tests, build+determinism, i18n+parity, wasm-drift, worker test, Playwright, parity tests). Invariants: local runs everything hardware allows (< 2 min); GitHub only for heavy/impossible (webkit matrix). Error cases: any gate failure → non-zero exit.

**Test Anchoring:**

| Test file / name                                 | Covers                     |
| ------------------------------------------------ | -------------------------- |
| `scripts/check-local.sh` — all 10 steps          | Local CI parity            |
| `tests/unit/port-regression.test.ts` — all tests | Port allocation (bun:test) |

### F-028: GitHub CI Pipeline

- **Status:** applied
- **Reviewed:** 2026-08-27

**Behavior Contract:** Preconditions: push to main or PR. Postconditions: 2 jobs — lint (typecheck + build + determinism + biome format gate + bun test) + test (chromium/firefox/webkit matrix with Playwright against local server). Invariants: SHA-pinned actions; playwright webServer handles server lifecycle. Error cases: any job failure → non-zero exit.

**Test Anchoring:**

| Test file / name                                   | Covers                                       |
| -------------------------------------------------- | -------------------------------------------- |
| `.github/workflows/ci.yml` — lint job              | Type-check + build + biome format + bun test |
| `.github/workflows/ci.yml` — test job (3 browsers) | Cross-browser Playwright                     |

### F-029: Dev/Public Deploy Workflow

- **Status:** applied
- **Reviewed:** 2026-08-27

**Behavior Contract:** Preconditions: dev + public repos configured. Postconditions: all work on dev main → squash onto squash-work (tracks public/main) → verify trees identical → push to public; GitHub Pages auto-deploys on push (~1-2 min); telemetry worker via wrangler. Invariants: public CI is the gate; WASM regeneration copies ONLY .wasm (loader/glue hand-adapted, unchanged). Error cases: tree mismatch → deploy blocked.

**Test Anchoring:**

| Test file / name                                      | Covers                    |
| ----------------------------------------------------- | ------------------------- |
| `scripts/check-local.sh` — step [5] build determinism | Build reproducibility     |
| `scripts/check-wasm-drift.sh`                         | WASM import compatibility |

---

## 12. Meta-Architecture: Known Seams

Honest assessment of where the architecture is fragile — every past bug traces to one of these:

1. **i18n activation races consumer load** (fixed 1.4.7): i18n.js activates + dispatches at module top-level, before consumers' listeners exist. Mitigation: state-derived text re-derived at state changes (updateToolbar); never rely on the initial `languagechange` dispatch. **If a future element shows English on first load in a non-English default, this seam is why.**
2. **Re-render vs in-flight operations**: language-switch card rebuilds race decode/share POSTs. Each instance (share rollback, mid-decode placeholder, error cards) was fixed individually. The rule: **always re-query the DOM by cardId; never mutate captured refs across an await**.
3. **Shared mutable arrays** (`successfulDecodes`/`failedDecodes`) with multiple writers — no encapsulation or invariant enforcement. The duplicate `failedDecodes.length = 0` dead line (fixed 1.4.8) is the class of bug this permits.
4. **Two i18n mechanisms** (declarative vs derived) — the split is intentional, but a new string must pick the right one; the derived side must follow the updateToolbar pattern.
5. **`S.totalFiles` vs `S.cardCount`** — two counters for the card population; drift is possible (currently consistent).
6. **WASM/loader contract** — the hand-adapted loader is the single most fragile integration point; `check-wasm-drift.sh` + AGENTS.md document it, but any wasm-bindgen upgrade needs a manual glue review.

---

_End of Feature Inventory — keep current. Updated: 2026-08-27. TECH_DEBT triaged in [TECH_DEBT_AUDIT.md](../TECH_DEBT_AUDIT.md)._
