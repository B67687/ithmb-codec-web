# CI Contract (pointer)

Canonical contract lives in the Codec repo: `docs/CI_CONTRACT.md` (single place
for all three repos' exact CI commands and env).

The web repo's detailed gate list now lives in
[TEST_STRATEGY.md](TEST_STRATEGY.md#ci-gates-and-the-local-mirror) so it cannot
drift from the test tiers. Short version:

- GitHub `ci.yml` runs on the **dev repo only**: push to `main`, `release` and
  `redesign/apple-tiles`, pull requests, manual dispatch. Doc-only changes are
  skipped by `paths-ignore`; the `guard` job skips the browser jobs when a commit
  message carries `[skip browsers]` on its own line.
- Playwright retries are **1** on CI (0 locally); the a11y gate enables
  `color-contrast` and the decoder/theme/TOC/drawer specs poll the data-state
  hooks instead of fixed sleeps.
- `lint` job: biome format gate, typecheck + build + determinism, public-tree,
  bun unit tests, wasm-drift. Browser jobs: chromium on push and PR; firefox and
  two sharded webkit jobs on PR only.
- Local mirror: `scripts/check-local.sh` (10 labelled gates) plus the legacy
  `scripts/check-parity.sh` flow.
- The public repo (`B67687/ithmb-codec-web`) is an allowlisted mirror with no CI;
  `wasm-drift` is enforced in both the lint job and the pre-commit hook.
