# TECH_DEBT_AUDIT.md — Ithmb-Codec-Web

> **Generated:** 2026-09-05 (refresh) | **HEAD:** 753e67c | **Method:** 9-dim audit (grep + ast-grep + tsc) | **Auditor:** Sisyphus | **Health:** 8.5/10 (WB-04 closed)
> **Stack:** TypeScript (strict), esbuild/WASM, Playwright + bun test, Cloudflare Worker | **LOC:** ~10k TS

## Severity × Effort Matrix

| Severity | Effort | Description                       |
| -------- | ------ | --------------------------------- |
| Critical | —      | Blocks CI, security, or data loss |
| High     | —      | Affects users or test reliability |
| Medium   | —      | Code quality, maintainability     |
| Low      | —      | Cosmetic, informational           |

| Effort | S <30m single file | M 1-2h multi-file | L half-day+ arch |

## Active (2026-09-05 refresh — 1 Open trivial + 0 Moderate; WB-01/03/04 fixed)

| ID      | Description                                                                       | File:Line                                                               | Severity     | Effort | Status       | Recommendation                                                                                                                                                                                      |
| ------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------ | ------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WB-01   | console.log in prod (was 3)                                                       | `ithmb-decoder/` (paths were stale `src/...`)                           | Trivial      | S      | **Fixed**    | Verified 2026-09-05: zero matches — removed                                                                                                                                                         |
| WB-02   | 2 over-exported symbols, never imported elsewhere                                 | `ithmb-decoder/share-actions.ts:10,12` (corrected)                      | Trivial      | S      | Open         | Re-verified 2026-09-05: still file-local only — remove `export` or keep; sole remaining open item                                                                                                   |
| WB-03   | prev/nextViewer duplication                                                       | `ithmb-decoder/viewer.ts:183-197` (corrected)                           | Trivial      | S      | **Fixed**    | Collapsed to `navigateViewer(-1\|1)` + thin wrappers, verified 2026-09-05                                                                                                                           |
| WB-04   | decoder.ts 0 unit tests (only Playwright e2e)                                     | `ithmb-decoder/decoder.ts`                                              | **Moderate** | M      | **Fixed**    | 753e67c: `decode-pipeline.ts` extracted + 3 suites, 69 vitest green, typecheck clean                                                                                                                |
| WB-05   | `escapeHtml` duplicated `utils.ts:20` vs `workers/crypto.ts:117`                  | `src/ithmb-decoder/utils.ts:20` ↔ `workers/telemetry/src/crypto.ts:117` | Low          | —      | Accepted     | Intentional — browser vs Worker boundary isolates; no change                                                                                                                                        |
| WB-06   | Unused `app.ts:14` `lastToastParams` flagged dead                                 | `src/ithmb-decoder/app.ts:14`                                           | Trivial      | S      | **Fixed**    | Was false positive — now used for toast dedup                                                                                                                                                       |
| WNF-001 | hreflang alternates missing (26) — intentional WARN                               | `check-local.sh`                                                        | Low          | S      | Wont-Fix     | Single-locale SEO not priority; zh/ mirrors are navigation aids                                                                                                                                     |
| QS-01   | 2 qs moderate advisories (array-limit bypass, isBuffer DoS) via http-server chain | `bun.lock` qs 6.15.3                                                    | Medium       | S      | **Accepted** | Waived 2026-09-07: dev-only localhost exposure, identical pins under npm; 6.16.0 bump clears nothing. Explicit waiver list in `scripts/check-audit.mts` (exact-match, fails closed on new findings) |

Full 9 dims otherwise clean: **0 `as any`/`@ts-ignore`, 0 `TODO`/`FIXME`, 0 `eval`/`innerHTML`, 0 `await` in loop, 0 empty `catch`, 0 `SELECT *`**. Audit 2026-09-07: 2 qs moderates waived (QS-01, dev-only, pre-existing) — wrapper fails closed on anything else.

## Resolved Items (history)

| ID    | Description                           | Resolved   | Resolution                                |
| ----- | ------------------------------------- | ---------- | ----------------------------------------- |
| TD-01 | Stale `batch:true` in FEATURES.md     | 2026-08-27 | Removed reference                         |
| TD-02 | Stale batch endpoint in Worker README | 2026-08-27 | Consolidated                              |
| TD-03 | No vitest unit tests                  | 2026-08-27 | Added vitest + 48 tests across 3 files    |
| TD-15 | a11y not failing CI                   | 2026-08-27 | Added assertion + `KNOWN_A11Y_EXCLUSIONS` |
| TD-16 | Worker monolith 740 lines             | 2026-08-27 | Split into 6 modules (≤250 LOC)           |

## Future Considerations (accepted, not active)

| ID    | Description                                                 | Severity | Effort | Notes                                               |
| ----- | ----------------------------------------------------------- | -------- | ------ | --------------------------------------------------- |
| TD-20 | Enterprise page hardcoded colors (not CSS vars)             | Low      | M      | Intentional "under construction" design             |
| TD-21 | Shared mutable arrays (`successfulDecodes`/`failedDecodes`) | Medium   | L      | Multiple writers, no encapsulation — past bug class |
| TD-22 | WASM/loader hand-adapted contract (`ithmb_wasm.js`)         | High     | L      | Most fragile point; `check-wasm-drift.sh` mitigates |
| TD-23 | Two counters: `S.totalFiles` vs `S.cardCount`               | Medium   | M      | Drift possible, currently consistent                |

## Top 5 Priorities (impact/effort)

1. **WB-04** — DONE (753e67c) — was the only real coverage gap
2. **WB-02** — re-triage 2 exports (S) — sole remaining open trivial
3. **WB-01/WB-03** — DONE, verified 2026-09-05
4. **WB-05** — accepted, no action
5. **WB-05** — accepted, no action

## Quick Wins Checklist (<30m each)

- [x] `console.log` removed — verified zero 2026-09-05
- [ ] `share-actions.ts:10,12` + `telemetry.ts:13` remove `export` (5 min)
- [x] `viewer.ts` merged to `navigateViewer(-1\|1)` — verified 2026-09-05
- [x] Decoder wiring tests — shipped 3 suites / 69 tests (753e67c)

## "Looks Bad But Is Fine"

- **`utils.ts` vs `workers/crypto.ts` `escapeHtml`** — Intentional duplication; Worker cannot import browser bundle.
- **`worker.ts` 6 modules after split** — Was monolith, now ≤250 LOC each. Not debt.
- **Wasm loader hand-adapted** — Flagged TD-22 but mitigated by `check-wasm-drift.sh`.

## Open Questions

1. Should `decoder.ts` vitest target `wbg` mock or real `ithmb_wasm_bg.wasm`?
2. Keep `console.log` behind `DEV` flag or delete entirely?

---

_Generated 2026-09-02. Per Engineering Plugin §4.7, keep triaged for REVIEW gate._
