# ADR-0009: Bun Runtime + Test + Package-Manager Migration

**Status:** Accepted (2026-09-07)

## Context

Stack was Node 22 + npm + tsx (script runner) + vitest (unit tests). Goal: a
modern single toolchain (bun 1.3.14 per inventory) without touching the
Playwright layer, which requires Node for its runner regardless.

## Decision

Three independently shippable, independently gated phases:

1. **Scripts tsx → bun.** Equivalence proven pre-switch: `bun build`
   byte-identical to tsx build (32 files sha256 — esbuild output plus
   content hashes deterministic across runtimes); `sync:i18n` no-op;
   i18n gates exit 0.
2. **vitest → `bun test`.** Only the portable subset was used
   (`describe/expect/it/beforeEach`, verified zero vitest-only APIs):
   6 import lines rewritten, 69/69 green. `@types/bun` devDep plus `"bun"`
   in `tsconfig.node.json` `types` (required: the explicit `types: ["node"]`
   allowlist does not auto-load new @types packages — 6× TS2307 without it).
   vitest dep removed in Phase 3.
3. **npm → bun (`bun.lock`).** Zero version drift on sampled pins
   (playwright/typescript/esbuild/miniflare identical). CI: pinned
   `oven-sh/setup-bun` (1.3.14) in both jobs; `setup-node` `cache: bun` is
   **rejected** (`Caching for 'bun' is not supported` — failed all jobs in
   12s), so an explicit `actions/cache` on `~/.bun/install/cache` keyed by
   `bun.lock` replaces it. `check-audit.mts` wrapper restores fail-closed
   audit semantics (`bun audit` exits 0 with findings).

## Consequences

- One manager, one runner for scripts/unit; Playwright stays Node-invoked.
- New maintenance surface: the audit wrapper and the bun version pin.
- Open: 2 pre-existing qs moderates (dev-only chain, identical pins under
  npm) need a fix-or-waive decision — tracked, not masked.
