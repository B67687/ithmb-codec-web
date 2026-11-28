# ADR-0010: Content-Hash `?v=` Cache-Busting with Determinism Gate

**Status:** Accepted (2026-09-07)

## Context

HTML referenced built assets as `/nav.js?v=3` with hand-bumped versions —
easy to forget, causing stale-cache bugs after updates.

## Decision

1. `scripts/build.mts` computes sha256-8 of each built asset and rewrites
   `?v=` in the 8 tracked HTML files, so the HTML always references exactly
   what was built.
2. Deterministic by construction (identical source → identical hashes;
   proven byte-identical local-vs-CI), enforced by `git diff --exit-code`
   after the build in CI: any `.ts` change re-stamps hashes, and the stamped
   HTML ships in the same commit or CI goes red.
3. Workflow rule: ALWAYS `bun run build` + commit HTML with any `.ts` change.

## Consequences

- No stale-cache class of bug; every asset change visibly re-stamps HTML.
- Commits touching `.ts` routinely include HTML hash churn (expected noise).
