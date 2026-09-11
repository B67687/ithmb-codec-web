# Web Test Strategy (2026-09-07)

The suite is visual-regression insurance. During creation the project suffered
repeated visual regressions, so coverage is intentionally redundant in places:
the same user journey is asserted from several angles (viewer flow, keyboard
nav, long-flow state). That redundancy is load-bearing — see the bug-link rule.

## Value map (what each file guards)

| File                       | Guards                                              | Cost          | Notes                                                 |
| -------------------------- | --------------------------------------------------- | ------------- | ----------------------------------------------------- |
| `upload` (6)               | Core decode flow (drop → decode → cards)            | cheap         | Highest value density                                 |
| `decode-failure` (3)       | Failure/unknown/error cards, no-hang                | cheap         | W3-cover; caught real i18n-key bugs                   |
| `ithmb-decoder` (17)       | Decoder page structure, dropzone, corner            | cheap         | Core page contract                                    |
| `pages` (8)                | Marketing/static pages, links, centering            | cheap         | Content-regression signal                             |
| `gallery` (35)             | Viewer journeys (nav, filmstrip, keys, grid)        | high          | Largest file; owns viewer journeys                    |
| `quality` (20)             | Responsive layouts + keyboard nav                   | high          | Mates to `:lang(zh)` margin, contrast bugs            |
| `stress` (11)              | End-to-end long flows                               | highest       | Re-walks gallery ground; slow by design               |
| `a11y` (10)                | axe scans (static + post-upload)                    | cheap         | Grew past 2; still fast locally (2s)                  |
| `perf-budget` (2)          | Byte budgets incl. WASM                             | high each     | Regression, not absolute lab speed                    |
| `visual` (8)               | Snapshot comparisons                                | moderate      | Direct weapon vs visual regressions; grow, don't trim |
| `seo-metadata` (20)        | Meta tags, lang redirects                           | cheap         | Grew past 11; still fast locally (2s)                 |
| `dark-mode` (3)            | Theme contract                                      | cheap         |                                                       |
| `unit/port-regression` (6) | Port-resolution pure logic                          | ~0 (bun test) | Moved 2026-09-07; imports config only, no browser     |
| `unit/` (75)               | Pure logic (naming, pipeline, store, worker, ports) | ~0 (bun test) | Cheapest signal per assertion                         |

## Tiers (frozen)

| Tier | Command                | Scope             | Budget                                            | When                       | Rule                                                    |
| ---- | ---------------------- | ----------------- | ------------------------------------------------- | -------------------------- | ------------------------------------------------------- |
| 0    | `bun test tests/unit/` | unit only (75)    | seconds                                           | every change               | No browser-less test may live in the Playwright runner  |
| 1    | `bun run test:quick`   | 7 files, chromium | <30s (measured 18s single-run, 116+1, 2026-09-07) | every change               | Exceeds budget → trim execution, never coverage         |
| 2    | full suite, chromium   | all 13 files      | <2min                                             | every push, non-negotiable | The insurance premium for the visual-regression history |
| 3    | full suite, 3 browsers | CI matrix only    | CI wall time                                      | CI                         | Local never pays for firefox/webkit                     |

## Rules (frozen)

1. **Bug-link rule.** Every regression test carries a one-line comment naming the
   regression it guards (what broke, when). A test that cannot name its bug is a
   deletion candidate. Scar tissue becomes documented armor.
2. **Optimize execution, never coverage.** Fewer browser launches, same
   assertions: shared setup, denser tests, Tier-appropriate browsers. Coverage
   cuts require naming the bug they re-expose — then don't cut.
3. **One execution per journey per tier.** Overlapping journeys (Escape×3,
   arrows×2) are kept for their distinct bug-links but consolidated to minimal
   launches; justification lives in per-file timings, not feelings.
4. **Snapshots grow.** Visual regressions were the founding wound; snapshot
   coverage expands with every visual fix.

## No-coverage-loss backlog

- [x] port-regression → unit runner (2026-09-07, pure move, zero coverage change)
- [x] CI workers 1 → 2 (2026-09-10; dominant wall-time cost, zero coverage change)
- [ ] Shared authenticated/loaded-state setup to cut repeated `goto` per file
- [x] Per-file chromium timings published in Baselines (2026-09-10; gallery+quality = 2/3 of Tier 1)
- [ ] stress stays Tier 2/CI; never Tier 1 (slow by design, value is the long flow)

## Baselines (2026-09-07, local)

- Tier 1: 116 passed + 1 skipped, 18s (chromium, 7 files)
- Tier 0: 75 passed, <1s (bun test, 7 files incl. port-regression)
- Tier 2/3 full: ~132 tests × browsers ≈ 400 executions, ~4min (the premium)
- Tier 1 per-file (chromium, separate runs, 2026-09-10): pages 2s (8), ithmb-decoder 3s (17),
  gallery 17s (35), upload 3s (6), quality 8s (20), a11y 2s (10), seo-metadata 3s (20).
- CI matrix before workers:2 ≈ 4min serial per browser job (config `workers: 1` was the cost).
