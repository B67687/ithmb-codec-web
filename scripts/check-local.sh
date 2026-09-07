#!/usr/bin/env bash
# check-local.sh — the full local CI for the TypeScript web repo.
#
# One command runs every gate the GitHub CI runs, locally:
#   bun run check:local
#
#   1. dependency security  (bun audit — FAILS on any vulnerability)
#   2. dependency staleness (bun outdated — informational only)
#   3. typecheck            (browser + node + worker tsconfigs)
#   4. unit tests           (bun test — pure logic, fast)
#   5. build + determinism  (build must not dirty the tracked tree)
#   6. i18n + mirror parity + zero-third-party guard
#   7. wasm-drift           (committed wasm imports vs loader glue)
#   8. telemetry worker test (miniflare)
#   9. full Playwright suite, all three browsers, against localhost:8899
#  10. parity gate hermetic tests (mocked gh/jq — edge cases, no network)
#
# Exit 0 = everything green. Non-zero = a gate failed.
set -e
cd "$(dirname "$0")/.."

echo "── check:local — full local CI ──"

echo "── [1] audit (fail-closed via check-audit.mts)"
bun scripts/check-audit.mts

echo "── [2] bun outdated (informational)"
bun outdated || true

echo "── [3] typecheck (browser + node + worker)"
bun run typecheck

echo "── [4] unit tests (bun test)"
bun run test:unit

echo "── [5] build + determinism"
BEFORE="$(git status --porcelain | md5sum)"
bun run build
AFTER="$(git status --porcelain | md5sum)"
if [ "$BEFORE" != "$AFTER" ]; then
  echo "FAIL: build dirtied the tracked tree (uncommitted ?v= hashes?)"
  git status --porcelain
  exit 1
fi

echo "── [6] i18n integrity + mirror parity + zero third-party"
bun run lint:i18n

echo "── [7] wasm-drift"
bash scripts/check-wasm-drift.sh

echo "── [8] telemetry worker test"
bun run test:worker

echo "── [9] full Playwright suite (all browsers, localhost:8899)"
if curl -s -o /dev/null --max-time 2 http://localhost:8899/; then
  echo "    (using the server already running on :8899)"
else
  echo "    (starting http-server on :8899)"
  bun x http-server -p 8899 -c-1 -s >/tmp/check-local-server.log 2>&1 &
  SERVER_PID=$!
  trap 'kill "$SERVER_PID" 2>/dev/null' EXIT
  sleep 2
fi
BASE_URL=http://localhost:8899 bun x playwright test

echo "── [10] parity gate hermetic tests (REVIEW 5.3)"
bash scripts/test-check-parity.sh

echo
echo "── check:local — ALL GREEN ──"
