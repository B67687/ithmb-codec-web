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
| MESO  | A component              | The decoder SPA, the telemetry worker |
| MICRO | An implementation detail | A single ES module or worker route    |

**Priority tiers:** Tier 1 = sections 0-7 (any project), Tier 2 = sections 8-11 (production), Tier 3 = sections 12-14 (ecosystem). Section 15 is the verification checklist.

---

## 0. Constitution (Immutable Project Rules)

```
Ithmb-Codec-Web Constitution:

1. Privacy first. User files and decoded data never leave the browser without explicit, informed, opt-in action. Telemetry is quiet-by-default.
2. Correctness. Decoded output must faithfully represent the .ithmb content; never emit fabricated or approximate pixels.
3. No magic. Every build step, translation, and network call must be discoverable and reproducible.
4. Inward dependency. The web layer depends on the ithmb-core engine, never the reverse.
5. Test what matters. The decode path, the i18n mirrors, and the telemetry privacy contract carry the highest test weight.
6. Fail with context. Every error surfaced to the user must be actionable and honest.
7. Tool-first. Use the repo's canonical scripts and gates rather than ad hoc commands.
8. No new runtime dependency without a Y-Statement. Dependencies are deliberate, pinned, and audited.
```

**MESO/MICRO:** These rules bind every module and every line. A rule violation is a REVIEW failure, not a style preference. The quiet-by-default privacy rule (1) is the single most important invariant and is enforced by the telemetry worker and the card-success-ui interaction contract.

## 1. Overview & Derived Ambition

### MACRO: System Vision

```
Project name: Ithmb-Codec-Web
One-line: A free, private, browser-based decoder for Apple .ithmb (iThumbnail) files.
Core ambition: Let anyone open .ithmb files in a browser with zero upload, zero account, zero tracking.
Why now: .ithmb files are opaque to normal image viewers; users lack a safe way to open them.
Success criteria WHEN...THEN:
  WHEN a user drops a .ithmb file onto the page THEN it decodes entirely in-browser without any network upload.
  WHEN a decode fails THEN the user can opt in to share a 16-byte prefix or the full file, and nothing is sent by default.
  WHEN the site is loaded THEN no request that identifies the visitor is made.
Stakeholders: End users opening .ithmb files, privacy-conscious users, the Ithmb-Codec maintainer.
```

**MESO/MICRO:** The ambition is delivered by three cooperating components: the decoder SPA (`ithmb-decoder/`), the static informational pages (Home, Guide, Enterprise, privacy, etc.), and the optional telemetry worker (`workers/telemetry/`). The SPA does the actual decoding via WASM; the static pages explain and route; the worker only ever receives what the user explicitly chooses to share.

### OUT OF SCOPE (V1)

- Server-side decoding. All decoding is client-side in the browser.
- User accounts, profiles, or saved history. There is no login and no persistence of user files.
- Batch server processing or an API for third parties.
- Anything that sends user file content automatically.

## 2. Architecture & Design Decisions

> **Y-Statement format:** _In the context of {{situation}}, facing {{concern}}, we decided for {{option}} to achieve {{goal}}, accepting {{downside}}._

**Decision 1: Client-side WASM decoding, no backend for the core path.**
_In the context of_ a privacy-first tool, _facing_ the risk that server-side processing would force users to upload sensitive thumbnails, _we decided for_ compiling the `ithmb-core` engine to WASM and running it entirely in the browser _to achieve_ true zero-upload privacy, _accepting_ a large initial payload (~194KB wasm) and the need to hand-adapt the loader (`ithmb_wasm.js` is hand-adapted and must not be replaced).

**Decision 2: Quiet-by-default telemetry with explicit opt-in.**
_In the context of_ wanting failure diagnostics _facing_ the conflict between observability and privacy, _we decided for_ a telemetry design where nothing is sent automatically and failure/unknown cards present an explicit opt-in share action _to achieve_ both diagnostics and privacy, _accepting_ lower telemetry volume and the need for careful UX copy.

**Decision 3: Static-first multi-page site plus a single SPA for decoding.**
_In the context of_ a content site that must be fast and indexable, _facing_ the complexity of a fully client-rendered app, _we decided for_ static HTML pages (Home, Guide, Enterprise) with one embedded SPA at `/ithmb-decoder/` _to achieve_ fast loads, good SEO, and a focused decoding surface, _accepting_ some duplication between page templates.

**Decision 4: en/zh i18n with a server-rendered authoritative language attribute.**
_In the context of_ an international audience _facing_ the risk of SEO-breaking duplicated content and FOUC, _we decided for_ a language-redirect script that runs before paint and a canonical `lang` attribute in the served HTML _to achieve_ correct initial language and indexable pages, _accepting_ an i18n parity gate (`lint:i18n`) that every change must pass.

### PROJECT_MODEL

See `docs/PROJECT_MODEL.md`. Current state: **POLISHED**. The full state machine, valid/invalid transitions, invariants, and blast radius map are defined there and mandated by this section.

## 3. File Tree & Module Responsibilities

| Path                               | Responsibility                                              | HIDES / EXPORTS / CALLER / Pre / Post / Invariant                               |
| ---------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `ithmb-decoder/app.js`             | Boots the decoder SPA; wires modules together               | CALLER of decoder, ui, state, input, i18n, telemetry                            |
| `ithmb-decoder/decoder.js`         | Orchestrates WASM decode; peek_prefix then decode_ithmb     | Pre: file bytes; Post: success canvas or failure/error; HIDES wasm call details |
| `ithmb-decoder/viewer.js`          | Filmstrip navigation, arrows, G key, Escape, swipe          | EXPORTS open/show; CALLER ui                                                    |
| `ithmb-decoder/state.js`           | App state, dedup via sharedSubmissionIds + processedFileIds | HIDES state shape; Invariant: no auto-send                                      |
| `ithmb-decoder/ui.js`              | DOM rendering, success/failure/error cards                  | CALLER cards, card-success-ui, share-actions                                    |
| `ithmb-decoder/utils.js`           | Shared helpers (hex dump, size checks)                      | EXPORTS pure helpers                                                            |
| `ithmb-decoder/input.js`           | File drop/select handling                                   | Pre: user gesture; Post: bytes to decoder                                       |
| `ithmb-decoder/telemetry.js`       | Opt-in share submission to worker                           | Invariant: nothing sent automatically                                           |
| `ithmb-decoder/download.js`        | Download All ZIP via JSZip (JPEG 92%/PNG/BMP/WebP)          | CALLER ui                                                                       |
| `ithmb-decoder/i18n.js`            | Locale strings for en/zh                                    | CALLER locales/*.json                                                           |
| `ithmb-decoder/share-actions.js`   | Share 16 bytes / full file (hidden >8MB)                    | CALLER ui, telemetry                                                            |
| `ithmb-decoder/card-success-ui.js` | Success card + report modal (6 issue types)                 | Invariant: report is opt-in                                                     |
| `ithmb-decoder/cards.js`           | Card rendering primitives                                   | CALLER ui                                                                       |
| `ithmb-decoder/ithmb_wasm.js`      | Hand-adapted WASM loader                                    | DO NOT REPLACE                                                                  |
| `ithmb-decoder/ithmb_wasm_bg.js`   | Generated wasm glue                                         | Generated; do not edit                                                          |
| `ithmb-decoder/ithmb_wasm_bg.wasm` | The compiled engine (~194KB)                                | Copied from Ithmb-Codec                                                         |
| `workers/telemetry/src/worker.ts`  | Cloudflare Worker: POST /, GET /dashboard, GET /            | HIDES KV schema; privacy contract                                               |
| `workers/telemetry/test-worker.ts` | Miniflare smoke test for the worker                         | Runs via `bun run test:worker`                                                  |
| `scripts/build.mts`                | Build pipeline (esbuild transform)                          | GENERATES .js from .ts                                                          |
| `scripts/check-local.sh`           | Local parity checks                                         | Mirrors CI locally                                                              |
| `scripts/check-parity.sh`          | Remote parity checks                                        | Mirrors CI locally                                                              |

## 4. Quality Gates

| Gate                 | Requirement (EARS)                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| G1 Build             | WHEN the build runs THEN it must complete via `bun run build` with no errors.                                       |
| G2 Typecheck         | WHEN any TS changes THEN `bun run typecheck` (all 3 tsconfigs) must pass.                                           |
| G3 i18n parity       | WHEN any locale or string changes THEN `bun run lint:i18n` must pass.                                               |
| G4 Test suite        | WHEN the test suite runs THEN all Playwright projects (chromium/firefox/webkit) must pass.                          |
| G5 WASM drift        | WHEN the wasm changes THEN `scripts/check-wasm-drift.sh` must detect and gate.                                      |
| G6 Telemetry privacy | WHEN the telemetry worker changes THEN `bun run test:worker` must pass and the quiet-by-default contract must hold. |
| G7 Secrets           | WHEN any commit is prepared THEN gitleaks must find no secrets.                                                     |

## 5. Dependencies & External Contracts

| Package                           | Version         | Purpose                                     | Contract         | License    |
| --------------------------------- | --------------- | ------------------------------------------- | ---------------- | ---------- |
| `esbuild`                         | dev             | TS/JS bundling and transform                | build only       | MIT        |
| `typescript`                      | dev             | Type checking                               | build only       | Apache-2.0 |
| `playwright` / `@playwright/test` | dev             | Browser testing                             | dev only         | Apache-2.0 |
| `miniflare`                       | dev             | Local Cloudflare worker runtime             | dev only         | MIT        |
| `fflate`                          | dev             | ZIP generation                              | runtime, bundled | MIT        |
| `bun`                             | 1.3.14 (pinned) | Script + unit-test runtime, package manager | dev only         | MIT        |
| `http-server`                     | dev             | Local static serving                        | dev only         | MIT        |
| `@axe-core/playwright`            | dev             | Accessibility testing                       | dev only         | MIT        |
| `@cloudflare/workers-types`       | dev             | Worker type definitions                     | dev only         | Apache-2.0 |
| `@types/node`                     | dev             | Node type definitions                       | dev only         | MIT        |
| `@types/bun`                      | dev             | Bun test/type definitions                   | dev only         | MIT        |
| `undici`                          | override        | HTTP client patch                           | override         | MIT        |

All dependencies are devDependencies or bundled runtime tools; the site ships no third-party runtime code on the public page. Lockfile (`bun.lock`) is tracked; installs via `bun install --frozen-lockfile`.

## 6. UX & Interface Contract

**Entry points:** `/` (Home), `/ithmb-decoder/` (Decoder SPA), `/guide/how-to-open-ithmb-files.html` (Guide), `/enterprise/` (Enterprise), plus privacy, preview, and footer/theme navigation.

**EARS behavior:** WHEN the user drops a file on the decoder THEN it decodes in-browser; WHEN decoding succeeds THEN a 600x400 success canvas renders; WHEN decoding fails THEN a share box with a hex dump of the first 16 bytes renders; WHEN the user opens the report modal on a success card THEN they pick one of 6 issue types to report (opt-in).

**Error contract:** All user-facing errors are honest and actionable. Nothing is sent automatically; every share/report action is explicit opt-in.

## 7. Timeline / Milestones

| Milestone    | Content                                                         |
| ------------ | --------------------------------------------------------------- |
| M1 (done)    | Core decoder SPA decoding .ithmb via WASM                       |
| M2 (done)    | Static pages, en/zh i18n, guide, enterprise                     |
| M3 (done)    | Opt-in telemetry worker with privacy contract                   |
| M4 (done)    | Full Playwright suite across 3 browser projects, CI on Dev repo |
| M5 (current) | REVIEW remediation to PASS; governance docs                     |

**Circuit breaker:** If the WASM drift gate, i18n parity gate, or test suite regresses, work stops and the gate must be fixed before any further changes.

## 8. Testing Strategy

- **Playwright E2E** across chromium/firefox/webkit covering pages, decoder, gallery, stress, upload, quality, a11y, SEO metadata, visual, dark-mode, decode-failure, perf-budget, plus port-resolution unit tests in `tests/unit/` (execution tiers frozen in docs/TEST_STRATEGY.md).
- **Worker smoke** via miniflare (`bun run test:worker`).
- **i18n parity** gate ensures en/zh mirrors stay in sync.
- **WASM drift** gate ensures the bundled wasm stays in sync with the core.
- Priority: decode correctness, privacy contract, i18n parity, and a11y carry the highest weight.

## 9. Operational Resilience

- Static hosting via GitHub Pages with a custom domain (CNAME `ithmb-codec.dev`).
- The telemetry worker is a single Cloudflare Worker; its dashboard is bounded to a 5000-record scan.
- Failure of telemetry must never break the decoder (telemetry is best-effort).
- No user data is stored server-side except what is explicitly shared and retained under a 365-day TTL.

## 10. Build & Release Pipeline

- Local: `bun run build` (esbuild transform), `bun run typecheck`, `bun run test`, `bun run test:worker`.
- CI runs on both Dev and public repos (free public minutes are the fallback; four-layer model: local -> github-dev CI -> public append-only).
- Deploy: GitHub Pages from the public repo `main` branch (CNAME stripped for the -Dev variant).
- **MESO Distribution Surfaces:** (1) the public GitHub Pages site at ithmb-codec.dev, (2) the telemetry worker endpoint. Both are append-only release surfaces.

## 11. Design for Change

| Change              | Impact                          | Notes                         |
| ------------------- | ------------------------------- | ----------------------------- |
| New locale          | i18n.json files + parity gate   | Small, isolated               |
| New decoder feature | decoder.js, ui.js, tests        | Medium, test-heavy            |
| New telemetry field | worker.ts, telemetry.js, tests  | Medium, privacy-reviewed      |
| WASM engine update  | ithmb_wasm_bg.wasm + drift gate | Large, must re-run full suite |
| New page            | static HTML + nav + tests       | Small                         |

Size rule: keep modules under the 250/40 guideline (250 lines, 40 responsibilities); a module that grows beyond it should be split into cohesive submodules.

## 12. Documentation Strategy

- `README.md`: user-facing overview and quick start.
- `AGENTS.md`: agent-facing repo map and conventions.
- `docs/FEATURES.md`: authoritative feature inventory (F-### IDs).
- `SPECIFICATION.md`, `EXPLAINER.md`, `RULES.md`, `docs/PROJECT_MODEL.md`, `docs/shift-log.md`: Dev-Protocol governance set.
- `CHANGELOG.md`: release history.
- `docs/adr/`: architecture decision records.

## 13. Ecosystem & Community

- License: **MIT** (see `LICENSE`).
- The site is the user-facing surface of the Ithmb-Codec ecosystem; the decoder engine lives in the sibling `Ithmb-Codec` repo.
- Contributions follow the repo conventions in `AGENTS.md` and `RULES.md`.

## 14. AI Attribution & Transparency

- The project was built with AI assistance. Decisions are recorded in `docs/adr/`, `RULES.md`, and this specification.
- The repo owner is the sole author; commits carry no AI attribution trailers.

## 15. Verification Checklist

- [ ] Build passes (`bun run build`)
- [ ] Typecheck passes (all 3 tsconfigs)
- [ ] Full Playwright suite passes (3 browser projects)
- [ ] i18n parity gate passes
- [ ] WASM drift gate passes
- [ ] Worker smoke test passes
- [ ] gitleaks finds no secrets
- [ ] Every F-### feature in `docs/FEATURES.md` is implemented and tested
- [ ] No prohibited patterns (as any, @ts-ignore, empty catch) in production code
- [ ] Quiet-by-default privacy contract verified
