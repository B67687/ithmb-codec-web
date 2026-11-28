# ADR-0007: CI Speed — Playwright Browser Cache, webServer Config, Doc-Only Path Filters

**Status:** Accepted (2026-08-19)

## Context

The web repo's CI is the only automated gate. Full CI was ~6m15s, dominated not by test execution
but by per-run overhead:

1. **Playwright browser downloads**: each of the 3 browser matrix jobs
   (chromium/firefox/webkit) downloaded its browser (~100-200 MB) on every
   run with no cache. This was ~60-150 s per job and the single largest cost
   across the whole ithmb CI surface.
2. **The local test server was racy**: CI spawned `npx http-server` in the
   background, `sleep 3`, then ran Playwright. On a slow runner the server was
   sometimes not yet listening → a connection-refused flake class that the
   `retries: 2` mask partially hid. The 3-second sleep was a fixed guess, not a
   readiness check.
3. **Doc-only PRs paid full CI**: any README/docs change triggered the entire
   3-browser matrix even though no code changed.

**Decision**:

1. **Cache Playwright browsers** with `actions/cache@v4`, keyed on
   `node_modules/playwright-core/browsers.json` (which pins the exact browser
   revisions) — **not** `package-lock.json`, so a dependency bump does not force
   a ~200 MB re-download. Keys are **per-browser**
   (`pw-<browser>-<os>-<hash>`), not a single shared key, to avoid the
   concurrent-save last-writer-wins cache thrash across the matrix. On a cache
   hit we run `npx playwright install-deps <browser>` (apt only, ~20-40 s) so
   the browser's system libraries are present; on a miss we run the full
   `npx playwright install --with-deps <browser>`.
2. **Move the server into Playwright's `webServer` config** in
   `playwright.config.ts`. Playwright starts `npx http-server -p 8899 -c-1 -s`,
   polls `http://localhost:8899` until 2xx (replacing the fixed `sleep 3`), and
   owns the server lifecycle (start + kill on exit). `reuseExistingServer:
   !process.env.CI` preserves the local `npm run serve` flow. The CI test step
   collapses to a bare `npx playwright test --project=<browser>`.
3. **Skip CI for doc-only PRs**: add `paths-ignore: ['docs/**', '*.md',
   '.github/**']` on the `pull_request` trigger. GitHub does not support
   per-job path filters, so this is workflow-level; a doc-only PR skipping the
   whole (non-code) CI is the intended, quality-preserving tradeoff. Code PRs
   always run the full matrix.

**Consequences**:

Positive:
- Full CI drops from ~6m15s to ~4m-4m30s (~25-35%) with zero loss of test
  coverage — every browser still runs every test on every code change.
- The server flake class (connection-refused from the fixed sleep) is
  eliminated; the URL-poll readiness check is strictly more correct.
- Doc-only PRs consume ~zero Actions minutes, preserving the free tier.
- Cache keys on `browsers.json` track real browser revisions, so a Playwright
  upgrade still re-downloads the delta (via `restore-keys` prefix fallback)
  rather than serving a stale browser.

Negative:
- Three cache entries (~100-200 MB each, ~400-500 MB total) consume part of
  the 10 GB/repo LRU cache budget — acceptable, well within limits.
- Workflow-level `paths-ignore` means a doc-only PR that incidentally touches
  code would skip CI; the `push: [main]` trigger still runs full CI, and a code
  PR is never doc-only.

Neutral:
- `actions/cache@v4` pinned to a verified SHA, matching the repo's
  SHA-pinning convention.

## Related

- `playwright.config.ts`, `.github/workflows/ci.yml`.
