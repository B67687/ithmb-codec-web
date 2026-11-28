# Web Test Strategy (updated 2026-11-28)

The suite is visual-regression and contract insurance. During creation the
project suffered repeated visual regressions, so coverage is intentionally
redundant in places: the same user journey is asserted from several angles
(viewer flow, keyboard nav, long-flow state). That redundancy is load-bearing —
see the bug-link rule.

Counts verified on `redesign/apple-tiles` at `30a58d6` with
`npx playwright test --list` and `bun test tests/unit/` on 2026-11-28:
**33 spec files, 894 listed tests (298 per browser project), 78 unit tests in 6
files.** The latest full local chromium run was **297 passed, 1 skipped, 0
failed** (~36 s). Treat that run as the current check, not a permanent baseline;
the canonical number table lives in `ARCHITECTURE.md` §Current release facts.

## Value map (what each file guards)

| File                       | Guards                                              | Cost          | Notes                                                 |
| -------------------------- | --------------------------------------------------- | ------------- | ----------------------------------------------------- |
| `pages` (6)                | Home/guide structure, links, title/copy             | cheap         | Page contract, not pixel truth                        |
| `ithmb-decoder` (21)       | Decoder page structure, dropzone, toolbar, tokens   | cheap         | Core page contract                                    |
| `upload` (6)               | Drop/click flow, batches, dedupe                    | cheap         | Highest value density                                 |
| `decode-failure` (3)       | Failure/unknown/error cards, no-hang                | cheap         | Human-readable failure copy                           |
| `gallery` (31)             | Viewer journeys (nav, filmstrip, keys, ZIP)         | high          | Largest file; owns viewer journeys                    |
| `quality` (10)             | Responsive layouts, keyboard, error states          | high          | 375/768 widths, retry, error toast                    |
| `stress` (11)              | End-to-end long flows                               | highest       | Re-walks gallery ground; slow by design               |
| `a11y` (34)                | axe scans: 11 pages × light/dark + decoder loaded/failure/init-failure + confirm dialog + drawer + lightbox | cheap | Zero critical/serious violations, **colour contrast included** |
| `contrast` (2)             | Guide progress-rail number contrast in light/dark    | cheap         | Pins the CH-15 regression under the axe gate          |
| `state-hooks` (8)          | Decoder init / decode-phase / viewer state hooks + heading/live-region structure | cheap | Pollable app state, one h1, one announcer |
| `perf-budget` (2)          | Byte + timing budgets incl. WASM/font               | high each     | Chromium-only; host gate measured separately          |
| `visual` (6)               | Snapshot comparisons                                | moderate      | Direct weapon vs visual regressions; grow, don't trim |
| `seo-metadata` (20)        | Meta tags, hreflang, CSP, direct-URL language rule  | cheap         | Rewritten for the no-redirect policy                   |
| `dark-mode` (7)            | Theme contract (pages + cards + toggle)             | cheap         | Manual toggle persistence                             |
| `mobile-nav` (3)           | Drawer open/close/focus                             | cheap         | APG button pattern                                    |
| `back-scroll` (2)          | Back-navigation scroll restore                      | cheap         | Desktop + mobile                                      |
| `build-pipeline` (12)      | Static shell, sitemap (10 URLs), `_redirects`, hashes, artifact hygiene | moderate | Includes "does not ship authored CSS layers or retired files" |
| `copy-sources` (5)         | Inline page copy vs locale-driven decoder           | cheap         | Copy-source boundary                                  |
| `decoder-smoke` (2)        | Built decoder smoke + module hashing                | cheap         | Post-build check                                      |
| `glass-nav` (4)            | Nav glass on scroll, no layout shift                | cheap         |                                                       |
| `link-policy` (6)          | External-link safety, destructive-action confirms   | cheap         |                                                       |
| `routes` (10)              | EN/ZH route map, aliases, sitemap/redirect registry | cheap         |                                                       |
| `toc-lock` (11)            | Guide rail + privacy TOC click lock and release     | cheap         | Position rules, wheel/key/motion release              |
| `decoder-integrity` (15)   | Prefix/length honesty, frame clip, dedupe, database rejection | high | MT-003/004/017 class defects                          |
| `decoder-ui3` (6)          | Viewer band/ambient/filmstrip UI pass               | cheap         | Ambient samples once, never on scroll                 |
| `decoder-ui4` (8)          | Always-on grid, viewer band, batch caps, mobile     | high          | No grid-toggle mode                                   |
| `decoder-ui5` (9)          | Export truth, ZIP gating, init queue, caps, keyboard| high          | Interaction contract                                  |
| `behavior-fixes` (9)       | Loading pill, language cancel, theme aria, drawer scroll lock, TOC rule | high | Post-launch behaviour contracts |
| `regression-fixes` (10)    | Theme pinning, viewer arrows, retry abort, drawer focus | high       | Named regressions post-launch                         |
| `ui-fixes` (4)             | Add-files control, copy timers, dialog double-open  | cheap         | Small UI regressions                                  |
| `decoder-polish` (6)       | 2 s loading reveal, no flash, Add-files widths       | high         | Loading/init polish                                   |
| `extension-blockers` (1)   | Module/asset names are not filter-list bait         | cheap         | Guards the uBOL rename (`file-digest`)                |
| `launch-blockers` (8)      | CSP violations, watchdog recovery, drawer, routing, No-JS | high    | Release-gate contracts                                |
| `unit/port-regression` (6) | Port-resolution pure logic                          | ~0 (bun test) | Imports config only, no browser                       |
| `unit/` (78)               | Pure logic (naming, pipeline, store, digest, ports) | ~0 (bun test) | Cheapest signal per assertion                         |

## Tiers (frozen)

| Tier | Command                | Scope                     | Budget                                       | When                       | Rule                                                    |
| ---- | ---------------------- | ------------------------- | -------------------------------------------- | -------------------------- | ------------------------------------------------------- |
| 0    | `bun test tests/unit/` | unit only (78)            | seconds                                      | every change               | No browser-less test may live in the Playwright runner  |
| 1    | `bun run test:quick`   | 7 files, chromium (128 tests) | <30s                                     | every change               | Exceeds budget → trim execution, never coverage         |
| 2    | full suite, chromium   | all 33 spec files (298 tests) | <2min                                    | every push, non-negotiable | The insurance premium for the visual-regression history |
| 3    | full suite, 3 browsers | CI matrix (PR only)       | CI wall time                                 | CI                         | The fast loop never pays for firefox/webkit; `check:local` runs whatever browsers are installed |

Tier 1 files: `pages`, `ithmb-decoder`, `gallery`, `upload`, `quality`, `a11y`,
`seo-metadata` (matches `package.json` `test:quick`).

## Rules (frozen)

1. **Bug-link rule.** Every regression test carries a one-line comment naming the
   regression it guards (what broke, when). A test that cannot name its bug is a
   deletion candidate. Scar tissue becomes documented armor.
2. **Optimize execution, never coverage.** Fewer browser launches, same
   assertions: shared setup, denser tests, Tier-appropriate browsers. Coverage
   cuts require naming the bug they re-expose — then don't cut.
3. **One execution per journey per tier.** Overlapping journeys are kept for
   their distinct bug-links but consolidated to minimal launches; justification
   lives in per-file timings, not feelings.
4. **Snapshots grow.** Visual regressions were the founding wound; snapshot
   coverage expands with every visual fix.

## CI gates and the local mirror

The cross-repo canonical CI contract lives in the codec repo's
`docs/CI_CONTRACT.md`. This is the web repo's current gate set; the short pointer
in `docs/CI_CONTRACT.md` links back here so the two do not drift into two copies.

**CI coverage:** `.github/workflows/ci.yml` runs on pushes to `main`, `release`
and `redesign/apple-tiles`, plus pull requests and manual dispatch, so the
launched branch is push-covered. Playwright retries are 1 on CI (0 locally), two
workers on CI, and the a11y gate enables `color-contrast`; the decoder loading /
failure, theme, copy, drawer and TOC specs poll the published data-state hooks
instead of fixed sleeps (see `tests/helpers.ts`).

**`scripts/check-local.sh` (10 labelled gates, `bun run check:local`):**
[1] fail-closed dependency audit (`check-audit.mts`), [2] `bun outdated`
(informational), [3] typecheck of the browser and node tsconfigs (no worker
tsconfig exists), [4] `bun test` unit tests, [5] build + determinism (`git status`
unchanged), [6] i18n integrity + EN/zh mirror parity + zero-third-party check,
[7] public-tree allowlist/leak gate, [8] wasm-drift, [9] full Playwright suite
against localhost:8899, [10] legacy parity-gate hermetic tests. The last gate
belongs to the superseded release-branch flow; it is not part of the direct-upload
release path.

**GitHub `ci.yml` (dev repo only, never the public mirror):**
- Triggers: push to `main`, `release` or `redesign/apple-tiles`, pull requests,
  manual dispatch. Doc-only changes (`docs/**`, `*.md`, `.github/**` on PRs) are
  skipped.
- `lint` job: biome format gate (1.9.4), `lint:modules` (typecheck + build +
  `git diff --exit-code` determinism), public-tree gate (skipped when the
  dev-only tooling is absent), `bun run test:unit`, wasm-drift.
- `guard` job: reads the head commit message and skips the browser jobs only when
  `[skip browsers]` appears on its own line.
- `test-chromium`: push and PR. `test-firefox`: PR only. `test-webkit-1-2` and
  `test-webkit-2-2`: PR only, sharded.
- Each browser job installs its browser (cached per browser), builds, and runs
  Playwright against its own `http-server`; superseded runs are cancelled by the
  concurrency group.
- Actions are SHA-pinned; Node 22 and bun 1.3.14 are pinned; Playwright retries
  are 1 on CI and 0 locally. The CI retry was lowered from 2 after the full
  Chromium suite ran repeatedly at `--retries=0` with no failures; it stays as
  a safety net for shared-runner variance only, not as a way to hide flaky
  tests. Sleeps around decoder loading/failure, theme, copy, drawer and TOC
  state were replaced with `expect.poll` against the published data-state
  hooks (see `tests/helpers.ts`); the remaining fixed waits are deliberate
  timing assertions only (see the no-coverage-loss backlog).

**Not in CI, on purpose:** `scripts/post-deploy-probe.mjs` (needs a deployed
host; 72 checks), `scripts/extension-harness.mjs` (needs a headful Chromium and
extension binaries) and the perf host model (400 kbps / 300 ms RTT / 4× CPU). Run
the probe and harness on the Pages preview before promoting, and after a deploy
that touches decoder assets or filenames.

**`scripts/check-parity.sh`:** asserts that the local check result and the GitHub
run result agree for the same commit (requires `gh`, `jq`, a clean tree and the
checked-out HEAD; configured in `scripts/check-parity.config` against the dev repo
and the `ci` workflow). It is tied to the legacy release-branch flow; the direct
upload does not use it.

## No-coverage-loss backlog

- [x] port-regression → unit runner (2026-09-07, pure move, zero coverage change)
- [x] CI workers 1 → 2 (2026-09-10; dominant wall-time cost, zero coverage change)
- [ ] Shared authenticated/loaded-state setup to cut repeated `goto` per file
- [x] Per-file chromium timings published in Baselines (2026-09-10; gallery+quality = 2/3 of Tier 1)
- [ ] stress stays Tier 2/CI; never Tier 1 (slow by design, value is the long flow)
- [ ] Real-device run (iOS Safari, low-RAM Android) for canvas memory and ZIP
- [ ] Screen-reader pass (NVDA/JAWS/VoiceOver) for the results grid and filmstrip
- [x] Add `redesign/apple-tiles` to the CI push filter (in the workflow at the
  2026-11-28 sync), then record a push run
- [x] Data-state hooks + sleep removal (CH-14, 2026-11-27): `html[data-decoder-state]`,
  `body[data-decode-phase]`, `body[data-viewer-state]` and helper polls replaced most
  fixed waits in the decoder/theme/TOC/drawer/copy specs.
- [x] Remaining fixed waits converted (CH-14 closeout, 2026-11-28): the 12 s settle
  sleeps in `gallery`/`stress` are now `waitDecodeSettled` polls; batch dedupe waits
  poll the persistent batch summary's `data-reasons` (and re-add through the Add-files
  control so the duplicate path actually fires); stage geometry polls a stable value;
  "stays visible" checks sample every frame; the key-hold test polls for the step.
  `waitForTimeout` calls: **27 -> 3**. The three that remain are deliberate timing
  assertions: the ~2 s loading-reveal check in `decoder-polish` and the two
  perf-measurement windows in `perf-budget` (LCP settle, decode/resource settle).

## Baselines (2026-09-07, local)

Historical measurements from the 2026-09 run, kept for trend comparison; the
current inventory is in the value map above.

- Tier 1: 116 passed + 1 skipped, 18s (chromium, 7 files)
- Tier 0: 75 passed, <1s (bun test, 7 files incl. port-regression)
- Tier 2/3 full: ~132 tests × browsers ≈ 400 executions, ~4min (the premium)
- Tier 1 per-file (chromium, separate runs, 2026-09-10): pages 2s (8), ithmb-decoder 3s (17),
  gallery 17s (35), upload 3s (6), quality 8s (20), a11y 2s (10), seo-metadata 3s (20).
- CI matrix before workers:2 ≈ 4min serial per browser job (config `workers: 1` was the cost).
- Current run (2026-11-28, chromium, full suite): 297 passed, 1 skipped, 0 failed
  in about 36 s. Host-model numbers are in `ARCHITECTURE.md` and
  `docs/DECISIONS.md` D-012.
