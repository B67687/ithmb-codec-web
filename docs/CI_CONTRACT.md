# CI Contract (pointer)

Canonical contract lives in the Codec repo: `docs/CI_CONTRACT.md`
(single place for all three repos' exact CI commands + env).

Web summary: `ci.yml` on push/PR to main (docs-only skipped) — lint
(biome gate, lint:modules + determinism, bun unit) → test matrix
(chromium/firefox/webkit); `[skip browsers]` opts out per-push.
Runs on BOTH dev + public (public minutes are free).
Local mirror: `scripts/check-local.sh` (audit → unit → Playwright).
