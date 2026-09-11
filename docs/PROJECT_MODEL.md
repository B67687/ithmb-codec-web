# The ithmb-codec-web Whole-Project State Machine

> This is the project's health contract. Every transition is logged in `docs/shift-log.md` and recorded in the commit history. SPECIFICATION section 2 mandates this model.

## States

```
IDEA -> SPEC'D -> PROTOTYPED -> IMPLEMENTED -> POLISHED -> SHIPPED -> MAINTAINED -> EVOLVED
```

| State | Meaning |
|---|---|
| IDEA | A concept before any design |
| SPEC'D | Written down in SPECIFICATION |
| PROTOTYPED | A working sketch exists |
| IMPLEMENTED | Feature-complete and tested |
| POLISHED | REVIEW remediation complete, all gates green |
| SHIPPED | Released to the public surface |
| MAINTAINED | Sustained with fixes |
| EVOLVED | Significant new capability added |

**Current state: POLISHED** (all gates green, governance docs complete, HEAD `4198c5c`).

## Valid Transitions

Standard path:

```
IDEA -> SPEC'D -> PROTOTYPED -> IMPLEMENTED -> POLISHED -> SHIPPED -> MAINTAINED -> EVOLVED
```

Valid deviations:

| Transition | When valid |
|---|---|
| SPEC'D -> IDEA | The spec is rejected before prototyping |
| IMPLEMENTED -> PROTOTYPED | Implementation reveals the sketch was wrong |
| Any state -> any EARLIER state | A REVIEW failure or regression forces divergence; restart from the earlier state |

The transition **POLISHED -> SHIPPED** is the release to the public surface, made only on explicit user go, following the github-workflow (squash delta, propagate local -> private -> public).

## Invalid Transitions

```
SHIPPED -> IMPLEMENTED        (never rework a shipped surface without a NEW spec + Y-Statement)
MAINTAINED -> IDEA            (never abandon a maintained project back to idea)
POLISHED -> SHIPPED without REVIEW pass
any state -> SHIPPED without passing the full verification gates
```

> These are invariants: they protect the append-only release contract and the quality bar.

## Invariants (What Must Never Change)

1. The privacy-first, quiet-by-default telemetry contract.
2. The append-only public release surface (never rewrite published history).
3. The hand-adapted `ithmb_wasm.js` loader (never replaced without a Y-Statement).
4. `origin` points at `ithmb-codec-web-dev.git` (private); public is never a work surface.
5. `.omo/` is never committed except the tracked shift-log.

## Blast Radius Map (coupled components that co-change)

| Change | Co-changes |
|---|---|
| WASM engine update | `ithmb_wasm_bg.wasm`, `check-wasm-drift.sh`, full test suite |
| Locale change | `locales/en.json`, `locales/zh.json`, `lint:i18n` gate |
| Telemetry field | `workers/telemetry/src/worker.ts`, `telemetry.js`, worker tests, privacy review |
| New page | static HTML, `nav`, page tests, sitemap |
| Decoder feature | `decoder.js`, `ui.js`, `card-*.js`, Playwright tests |

## Adding or Removing a State (Transition Update Procedure)

1. Propose the new state in a Y-Statement in SPECIFICATION section 2.
2. Update the state list, states table, and this blast radius map.
3. Record the transition in `docs/shift-log.md`.
4. Update the "Current state" line.

## Test

- [ ] The model reflects the current phase.
- [ ] Every transition this project has taken is logged.
- [ ] The invariants hold (privacy, append-only, origin, `.omo/`).
