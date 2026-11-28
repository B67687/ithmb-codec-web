#!/usr/bin/env bash
# test-check-parity.sh — hermetic tests for check-parity.sh (REVIEW 5.3).
#
# Runs the real check-parity.sh against a scratch git repo with a mocked `gh`
# CLI and canned GitHub Actions run JSON, covering the parity edge cases:
# missing run, pending run, multiple runs, remote failure, SHA mismatch,
# malformed config, dirty tree, .omo exemption, and the happy path.
#
# No network, no real repos, no secrets. Exit 0 = all scenarios pass.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PARITY="$SCRIPT_DIR/check-parity.sh"
SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT

PASS=0; FAIL=0
note() { echo "  PASS $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL $1" >&2; FAIL=$((FAIL + 1)); }

# ── stubbed `gh` ────────────────────────────────────────────────────────────
# The real `gh api ... --jq <filter>` applies the jq filter to the response and
# outputs the RESULT (an array of {name,status,conclusion}). The stub emulates
# that exactly: same shape, same workflow-name filter (read from the repo's own
# check-parity.config so it tracks the real WORKFLOWS value).
mkdir -p "$SCRATCH/bin"
cat > "$SCRATCH/bin/gh" <<'EOF'
#!/usr/bin/env bash
# stub gh: handles `api repos/<slug>/actions/runs?head_sha=...` with --jq
case "$1" in
  api)
    case "${GH_MOCK_CASE:-empty}" in
      empty)       DATA='{"workflow_runs": []}' ;;
      pending)     DATA='{"workflow_runs": [{"name":"ci","status":"in_progress","conclusion":null}]}' ;;
      mixed)       DATA='{"workflow_runs": [{"name":"ci","status":"completed","conclusion":"success"},{"name":"ci","status":"in_progress","conclusion":null}]}' ;;
      all-success) DATA='{"workflow_runs": [{"name":"ci","status":"completed","conclusion":"success"}]}' ;;
      failure)     DATA='{"workflow_runs": [{"name":"ci","status":"completed","conclusion":"failure"}]}' ;;
      *)           DATA='{"workflow_runs": []}' ;;
    esac
    WF="$(grep '^WORKFLOWS=' scripts/check-parity.config | cut -d'"' -f2)"
    jq -c --arg wf "$WF" \
      '[.workflow_runs[] | select(.name as $n | ($wf | split(" ") | index($n))) | {name, status, conclusion}]' \
      <<< "$DATA"
    ;;
  *) echo "unexpected gh invocation: $*" >&2; exit 9 ;;
esac
EOF
chmod +x "$SCRATCH/bin/gh"

# ── scratch repo builder ───────────────────────────────────────────────────
setup_repo() { # $1=LOCAL_CMD, $2..=extra config lines
  local cmd="$1"; shift
  rm -rf "$SCRATCH/repo"; mkdir -p "$SCRATCH/repo/scripts"
  mkdir -p "$SCRATCH/nohooks"
  git -C "$SCRATCH/repo" init -q
  git -C "$SCRATCH/repo" config user.email parity@test.local
  git -C "$SCRATCH/repo" config user.name parity
  {
    printf 'REPO_SLUG="B67687/Fake-Repo"\n'
    printf 'WORKFLOWS="ci"\n'
    printf 'LOCAL_CMD="%s"\n' "$cmd"
    for line in "$@"; do printf '%s\n' "$line"; done
  } > "$SCRATCH/repo/scripts/check-parity.config"
  cp "$PARITY" "$SCRATCH/repo/scripts/check-parity.sh"
  printf 'tracked\n' > "$SCRATCH/repo/a.txt"
  git -C "$SCRATCH/repo" add -A
  git -C "$SCRATCH/repo" -c core.hooksPath="$SCRATCH/nohooks" commit -qm init
}

run_parity() { # $@ = args to check-parity.sh; echoes exit code
  local args=("$@")
  (cd "$SCRATCH/repo" && PATH="$SCRATCH/bin:$PATH" bash scripts/check-parity.sh "${args[@]}" >/dev/null 2>&1)
  echo $?
}

echo "── parity hermetic tests ──"

# 1. missing run → no CI run for the SHA → PARITY_FAIL (exit 1)
setup_repo true
export GH_MOCK_CASE=empty
[ "$(run_parity)" = "1" ] && note "missing run -> PARITY_FAIL" || fail "missing run expected exit 1"

# 2. pending run → remote pending vs expected success → PARITY_FAIL (exit 1)
setup_repo true
export GH_MOCK_CASE=pending
[ "$(run_parity)" = "1" ] && note "pending run -> PARITY_FAIL" || fail "pending run expected exit 1"

# 3. multiple runs of the same workflow, one still running → PARITY_FAIL (exit 1)
setup_repo true
export GH_MOCK_CASE=mixed
[ "$(run_parity)" = "1" ] && note "multiple runs (one pending) -> PARITY_FAIL" || fail "multiple runs expected exit 1"

# 4. happy path: local pass + remote success → PARITY_OK (exit 0)
setup_repo true
export GH_MOCK_CASE=all-success
[ "$(run_parity)" = "0" ] && note "local pass + remote success -> PARITY_OK" || fail "happy path expected exit 0"

# 5. remote failure + local pass → divergence → PARITY_FAIL (exit 1)
setup_repo true
export GH_MOCK_CASE=failure
[ "$(run_parity)" = "1" ] && note "remote failure + local pass -> PARITY_FAIL" || fail "remote failure expected exit 1"

# 6. known-broken state agrees (local fail, remote failure, EXPECT both) → PARITY_OK (exit 0)
setup_repo false 'EXPECT_LOCAL="fail"' 'EXPECT_REMOTE="failure"'
export GH_MOCK_CASE=failure
[ "$(run_parity)" = "0" ] && note "known-broken state agrees -> PARITY_OK" || fail "known-broken parity expected exit 0"

# 7. SHA mismatch: requested SHA != checked-out HEAD → PARITY_ERROR (exit 2)
setup_repo true
export GH_MOCK_CASE=all-success
[ "$(run_parity 0000000000000000000000000000000000000000)" = "2" ] \
  && note "SHA mismatch -> PARITY_ERROR" || fail "SHA mismatch expected exit 2"

# 8. dirty tree outside .omo/ → PARITY_ERROR (exit 2)
setup_repo true
printf 'dirty\n' >> "$SCRATCH/repo/a.txt"
[ "$(run_parity)" = "2" ] && note "dirty tree -> PARITY_ERROR" || fail "dirty tree expected exit 2"

# 9. dirty tree with only .omo/ ephemera → exempt → PARITY_OK (exit 0)
setup_repo true
mkdir -p "$SCRATCH/repo/.omo/audit"
printf 'x\n' > "$SCRATCH/repo/.omo/audit/note.txt"
export GH_MOCK_CASE=all-success
[ "$(run_parity)" = "0" ] && note ".omo/ only dirt exempt -> PARITY_OK" || fail ".omo exemption expected exit 0"

# 10. malformed config (missing REPO_SLUG) → PARITY_ERROR (exit 2)
setup_repo true
sed -i '/^REPO_SLUG=/d' "$SCRATCH/repo/scripts/check-parity.config"
export GH_MOCK_CASE=all-success
[ "$(run_parity)" = "2" ] && note "malformed config -> PARITY_ERROR" || fail "malformed config expected exit 2"

# 11. missing config file → PARITY_ERROR (exit 2)
setup_repo true
rm "$SCRATCH/repo/scripts/check-parity.config"
export GH_MOCK_CASE=all-success
[ "$(run_parity)" = "2" ] && note "missing config -> PARITY_ERROR" || fail "missing config expected exit 2"

# 12. gh CLI missing → PARITY_ERROR (exit 2)
setup_repo true
export GH_MOCK_CASE=all-success
set +e
(cd "$SCRATCH/repo" && bash scripts/check-parity.sh >/dev/null 2>&1)
rc=$?
set -e
[ "$rc" = "2" ] && note "missing gh -> PARITY_ERROR" || fail "missing gh expected exit 2"

echo
if [ "$FAIL" -eq 0 ]; then
  echo "── parity hermetic tests — ALL $PASS PASS ──"
  exit 0
else
  echo "── parity hermetic tests — $FAIL FAILED, $PASS PASSED ──" >&2
  exit 1
fi