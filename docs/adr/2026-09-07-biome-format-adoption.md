# ADR-0008: Biome Formatter Adoption (Format-Only Gate)

**Status:** Accepted (2026-09-07)

## Context

The repo had no formatter; the tsc-strictness pass produced formatting churn
that had to be disclosed by hand. Quote style, trailing commas, and line width
drifted per author.

## Decision

1. **Biome 1.9.4**, config in `biome.json` (2-space, 100-col, double quotes,
   semicolons, trailing commas — matching the existing code's dominant style).
2. **Format-only enforcement**: CI gate runs `biome format` (exit 1 on diff);
   local mirror `npm run format:check` (exact same command).
3. **Recommended lint stays unenforced**: 199 pre-existing violations (mostly
   `noNonNullAssertion`) are a separate project, explicitly dismissed as a gate.
4. **Formatter-hostile blocks get `biome-ignore format`**: `EMBEDDED_EN` in
   `i18n.ts` must stay `JSON.parse`-able for `check-i18n.mts`, but Biome
   single-quotes values containing `"` — the ignore comment plus `sync:i18n`
   regen keeps it canonical. Rule: generated/parsed-as-JSON blocks are
   ignore-commented BEFORE any format pass.
5. Local-only paths (broken `.codegraph` symlink) go in `files.ignore`.

## Consequences

- Formatting is stable and gated; the gate already paid for itself (found the
  `styles.css` stray lines and the `EMBEDDED_EN` corruption before merge).
- Full `biome check`/lint gating is off the table until someone funds the
  199-violation cleanup.
