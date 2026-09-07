# ARCHITECTURE.md — System Architecture

> Lean C4 Level 1 view. For feature inventory see `docs/FEATURES.md`; for tech debt see `TECH_DEBT_AUDIT.md`.

## C4 Level 1 — System Context

```
┌──────────────────────────────────────────────────────────────────┐
│                        ITHMB Codec Web                           │
│                                                                  │
│  ┌────────────────────┐        ┌─────────────────────────────┐  │
│  │   Client SPA       │        │  Cloudflare Worker           │  │
│  │   ithmb-decoder/   │───────▶│  workers/telemetry/src/     │  │
│  │                    │  POST  │                             │  │
│  │  • app.ts          │        │  • worker.ts    (router)    │  │
│  │  • decoder.ts      │        │  • types.ts     (Env)       │  │
│  │  • cards.ts        │        │  • crypto.ts    (HMAC)      │  │
│  │  • viewer.ts       │        │  • dashboard.ts (HTML)      │  │
│  │  • i18n.ts         │        │  • validation.ts            │  │
│  │  • telemetry.ts    │        │  • persistence.ts (KV)      │  │
│  │  • download.ts     │        └──────────┬──────────────────┘  │
│  │  • state.ts        │                   │                     │
│  │  • ui.ts           │                   ▼                     │
│  │  • utils.ts        │        ┌─────────────────────┐          │
│  └────────┬───────────┘        │  Cloudflare KV      │          │
│           │                    │  (telemetry store)  │          │
│           ▼                    └─────────────────────┘          │
│  ┌────────────────────────┐                                     │
│  │  ithmb_wasm_bg.wasm    │                                     │
│  │  (Rust → wasm-bindgen) │                                     │
│  │  from Ithmb-Codec repo │                                     │
│  └────────────────────────┘                                     │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Static pages: nav.ts, footer.ts, theme.ts, lang-redirect │  │
│  │  index.html, guide/, enterprise/, privacy/, zh/            │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
  ┌──────────────┐           ┌──────────────────────┐
  │  User Browser│           │  GitHub Pages (CI)    │
  │  (local WASM)│           │  3-browser matrix    │
  └──────────────┘           └──────────────────────┘
```

## Module Map

### Decoder SPA (`ithmb-decoder/`)

| Module               | Responsibility                               |
| -------------------- | -------------------------------------------- |
| `app.ts`             | Init, keyboard, dropzone, languagechange     |
| `decoder.ts`         | `decodeFile`: wasm call, success/failure     |
| `cards.ts`           | Decode-result lists (add/query/reset)        |
| `card-success-ui.ts` | Success card render + reRenderCards          |
| `card-failure-ui.ts` | Failed/unknown card render                   |
| `ui.ts`              | File cards, processFiles (batch/dedup)       |
| `viewer.ts`          | Fullscreen viewer, stage, toolbar, download  |
| `i18n.ts`            | en/zh tables, `setLang`, `applyTranslations` |
| `telemetry.ts`       | POST to worker (payload-aware timeout)       |
| `download.ts`        | Download All ZIP (fflate)                    |
| `state.ts`           | `S` singleton + dedup Sets                   |
| `utils.ts`           | formatSize, showToast, escapeHtml, hex       |

### Telemetry Worker (`workers/telemetry/src/`)

6 modules, all ≤250 LOC. Thin router → validation → crypto → persistence → dashboard.

### Root scripts (`scripts/`)

| Script                    | Gate               |
| ------------------------- | ------------------ |
| `build.mts`               | esbuild transform  |
| `check-i18n.mts`          | i18n integrity     |
| `check-mirror-parity.mts` | en/zh parity       |
| `check-wasm-drift.sh`     | wasm import match  |
| `check-local.sh`          | Full local CI (10) |
| `check-parity.sh`         | Local↔GitHub gate  |

### Tests (`tests/`)

Playwright specs (pages, decoder, gallery, stress, upload, quality, a11y, seo-metadata, visual, dark-mode, decode-failure, perf-budget — tiers in docs/TEST_STRATEGY.md) + bun unit tests in `tests/unit/` (`bun:test`, incl. port-regression).

## Fitness Functions

| Metric                | Threshold  | Enforcement               |
| --------------------- | ---------- | ------------------------- |
| File length           | ≤ 250 LOC  | Review gate               |
| Function length       | ≤ 40 LOC   | Review gate               |
| Cyclomatic complexity | ≤ 10       | Review gate               |
| `unwrap` (Rust deps)  | 0          | wasm-drift + review       |
| a11y violations       | 0 critical | `test:a11y` blocks CI     |
| Runtime dependencies  | 0          | `package.json` contract   |
| Generated file edit   | Forbidden  | `check:local` determinism |

## Local vs GitHub CI

| Gate                      | Local (`check:local`) | GitHub CI | Why GitHub?                                |
| ------------------------- | :-------------------: | :-------: | ------------------------------------------ |
| npm audit                 |          ✅           |     —     | Local is enough                            |
| typecheck (3 tsconfigs)   |          ✅           |    ✅     | Deterministic                              |
| unit tests (bun test)     |          ✅           |    ✅     | Fast, no browser                           |
| biome format gate (1.9.4) |          ✅           |    ✅     | Format-only; lint unenforced               |
| audit (fail-closed)       |          ✅           |     —     | check-audit.mts wrapper; bun audit exits 0 |
| build + determinism       |          ✅           |    ✅     | Clean build check                          |
| i18n + mirror parity      |          ✅           |     —     | Local is enough                            |
| wasm-drift                |          ✅           |     —     | Local is enough                            |
| telemetry worker test     |          ✅           |     —     | Local is enough                            |
| Playwright (chromium)     |          ✅           |    ✅     | Core browser                               |
| Playwright (firefox)      |          ✅           |    ✅     | CI matrix                                  |
| Playwright (webkit)       |  ❌ (not installed)   |    ✅     | Needs CI runner                            |
| parity gate tests         |          ✅           |     —     | Local is enough                            |

**Local time target: < 2 minutes.** GitHub supplements with webkit matrix only.
