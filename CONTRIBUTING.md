# Contributing

Pull requests are **closed** on this repo — they cannot be opened. The contribution channel is **issues**.

A good issue contains: what you did, what you expected, what happened instead, and your
environment (OS, browser). For site/decode problems, attach the sample file plus where it
came from. Screenshots help for anything visual.

## Orientation tour (30 minutes)

1. `README.md` — what the site is and how to run it locally.
2. `docs/DECISIONS.md` — why the site is static, local-only, mirror-as-orphan, and where the scope limits are.
3. `ARCHITECTURE.md` — pages, decoder app, gates, and the curated `_site` deployment map.
4. `docs/FEATURES.md` — what each surface does.
5. `docs/DESIGN.md` — tokens, themes, fonts, components, breakpoints, page chrome.
6. `docs/TEST_STRATEGY.md` — the test tiers, CI gates, and the bug-link rule; read before touching tests.
7. `SPECIFICATION.md` — behaviors with acceptance criteria.

## Per-repo guidance

- **WASM comes from public codec releases only** — never hand-build it; see `../ithmb-codec/docs/RELEASE_TRAIN.md`.
- **Any `.ts` change needs `bun run build` + committed HTML** (the determinism gate checks that the build does not dirty the tree).
- **Tests run in tiers** (`docs/TEST_STRATEGY.md`); use `[skip browsers]` in the commit message
  only for changes with no browser surface (config, docs).
- **Every regression test names its bug** (one-line comment) — a test that cannot name its
  bug is a deletion candidate.
- **Committing**: atomic, present-tense imperative subjects, signed, no tool-attribution trailers.
