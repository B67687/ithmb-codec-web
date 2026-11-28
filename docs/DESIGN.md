# DESIGN.md: Design System

Current design system for the Apple-tiles redesign, shipped 2026-11-26. Last
verified against the tree at `30a58d6`; if the CSS changes, update this file in
the same change. Historical decisions live in `docs/DECISIONS.md` and
`docs/adr/`; this is a current-state reference, not a history. Build counts and
asset sizes are kept in `ARCHITECTURE.md` §Current release facts.

## Where the styles live

| Source | Owns |
| --- | --- |
| `ithmb-decoder/css/00-tokens.css` | Every design variable: colour, type, spacing, radius, shadow, glass, viewer/ambient tokens, light + dark. |
| `ithmb-decoder/css/10-base.css` | Reset, document defaults, `@font-face`, typographic scale primitives. |
| `ithmb-decoder/css/20-components.css` | Shared chrome: navigation, footer, buttons, cards, home hero/mock, guide chrome, dialogs/floating bits. |
| `ithmb-decoder/css/30-decoder.css` | Decoder shell, dropzone, toolbar, results grid, filmstrip, viewer band, failure card. |
| `ithmb-decoder/css/40-pages.css` | Page-specific rules for home, 404 and privacy plus the typography pass. |
| `ithmb-decoder/css/50-polish.css` | Late layout/accessibility overrides being flattened into the owning layers. |
| `ithmb-decoder/css/60-glass.css` | Glass materials, fallbacks, reduced-motion rules. |
| `home-mock.css`, `guide/guide.css`, `privacy/redesign.css` | Page-local styles; they consume layer-0 tokens and must not redefine core colour/type/radius/glass tokens. |

`ithmb-decoder/styles.css` is a **build artifact**: `scripts/build.mts`
concatenates the numbered layers in order. Edit the layer, never the artifact.
The numbered source layers are dev-only and are not in `_site`; the deploy
artifact ships the concatenated `styles.css` and the page stylesheets. The nav
and footer are not injected by JS at runtime: `src/shell.ts` renders them into every
page at build time, and the classic `src/nav.ts` / `src/footer.ts` bind to that markup.

There is no CSS framework, preprocessor, or utility layer. Class names are
hand-written BEM-ish; JS adds state classes (`is-*`, `nav-open`, `viewer-mode`,
`active`, `failed`, `show`). Page copy is inline in the HTML; the decoder is the
only locale-driven surface.

## Fonts

- **One variable font**: `ithmb-decoder/fonts/InterVariable-subset.woff2`, a
  Latin-plus-punctuation subset of Inter, declared with
  `font-weight: 100 900` and `font-display: swap`. Size at the current release:
  **39,736 B (~40 KB)**; the perf gate requires ≤ 80 KB and forbids an italic
  file.
- Two family names point at the same file: `"Inter"` (base layer) and
  `"InterVar"` (component layer). Both are referenced by the token stacks
  `--font-display` and `--font-text`, which fall back to
  `"Inter Fallback", -apple-system, BlinkMacSystemFont, "SF Pro Display"/
  "SF Pro Text", "Segoe UI", sans-serif`.
- `"Inter Fallback"` is a metric-matched local fallback (`local("Arial")`,
  `local("Helvetica Neue")`) with `size-adjust: 105.26%`, ascent/descent
  overrides and zero line gap, so text does not jump when the webfont swaps in.
- No second webfont, no icon font, no Google Fonts or CDN; the font is a
  same-origin asset and is content-hashed by the build.

## Tokens (layer 0)

Light values live on `:root`; the dark theme is a single token layer on
`:root[data-theme="dark"]` (the old pre-redesign palette and later contrast
override are folded into it). Key groups:

- **Surface/ink**: `--bg`, `--surface`, `--card-bg`, `--border`, `--text`,
  `--ink-2`, `--muted`, `--faint`, `--fog`, `--fog-deep`, `--canvas`.
  Light is white/#f5f5f7; dark is #000 with #1c1c1e surfaces.
- **Accent/status**: `--accent` (#0071e3 light, #0a84ff dark), `--accent-hover`,
  `--link` (#0066cc light, #2997ff dark), `--success`, `--warn`; badge tints
  (`--badge-*`) are theme-aware.
- **Shape/motion**: `--radius` (18 px, plus `--radius-s` 12 px and `--radius-l`
  26 px), `--shadow`, `--shadow-s`, `--ease`, `--ease-out`.
- **Layout**: `--max` (980 px), `--max-wide` (1180 px), `--nav-h` (48 px),
  `--nav-panel-h` (set by the mobile drawer), breakpoint tokens
  (`--bp-floor` 360, `--bp-chrome` 480, `--bp-tablet` 768, `--bp-desktop` 1024).
- **Glass**: `--glass-blur`, `--glass-saturate`, nav/float/arrow/film/rail/chip
  colours, with fallbacks in `60-glass.css`.
- **Viewer**: `--viewer-bg`, `--viewer-edge`, `--viewer-glow`, `--viewer-fg*`,
  `--viewer-glass*`, `--viewer-arrow-*`, `--viewer-count-*`, `--viewer-thumb-*`,
  `--viewer-link`, `--viewer-focus-ring`, `--viewer-image-shadow`,
  `--ambient-*`. The viewer can be theme-matched (default), `dark-stage`, or
  `inverted` via `data-viewer-mode` on `<html>`.
- **Atmosphere**: `--wash-*` radial/linear washes applied as static
  `background-image` layers on the home sections, page tops, footer and viewer
  band; no extra blur layers.

Page-local tokens are allowed only when documented next to their definition.

## Theming

`src/theme.ts` runs in `<head>` as a classic script, so `data-theme` is set before
first paint. Resolution: stored `localStorage["ithmbTheme"]` (`light`/`dark`),
otherwise `prefers-color-scheme`; while no explicit choice is stored, the page
follows live OS changes. The nav toggle calls `window.IthmbTheme.toggle()`, which
persists an explicit choice and pins it: later OS changes do not override an
explicit choice. Storage-blocked contexts still apply the theme for the page and
keep following the OS. Dark is a real design mode (own tokens, viewer band,
imagery edges), not a filter.

## Loading and failure surfaces

- `#decoding` sits in the DOM from first paint but stays hidden for the first
  **2 s**, so a fast local load never flashes a label. After that it shows a
  spinner plus real byte progress ("Loading decoder… 42%"), then
  "Preparing decoder…" while WASM compiles.
- One shared failure panel (title, body, Retry, detail region) serves both the
  7,000 ms module-graph watchdog and the 15,000 ms init watchdog. It is
  keyboard reachable, Retry is in the viewport at 390 px, the Chinese panel uses
  the Chinese locale, and it replaces the loading state rather than stacking on
  it.
- Failure copy in the panel is intentionally plain and honest; the decoder's own
  decode failure cards are a separate surface (reason, prefix/size, next steps).

## Breakpoints and layout

Media queries use literal widths rather than the `--bp-*` tokens (tokens are the
documented intent; 360 is the no-break floor). The widths in use are **1068,
834, 768, 640, 560 and 480 px** plus `prefers-reduced-motion`.

- Wide content uses `--max` (980 px) or `--max-wide` (1180 px); the decoder
  viewer and results grid use the wide shell.
- The viewer band is always-on with the results grid; `G` is a no-op and there is
  no separate grid viewer mode. At narrow widths the grid pages instead of
  shrinking endlessly.
- Filmstrip thumbs are 80×55 desktop / 68×46 phone / 62×44 at ≤360 px with
  snap scrolling; the rail centres when short and scrolls when full.
- Touch targets follow 44 px; the mobile drawer is keyboard operable with a
  scrim, focus move/return, and a scroll lock that restores the exact position on
  close; reduced-motion removes ambient/transition effects.
- The guide rail and privacy TOC use a position rule, not an intersection
  threshold: the active section is the last one whose top passed the sticky-nav
  threshold (guide: 32% viewport marker; privacy: nav height + 32 px). A clicked
  TOC link holds its highlight until the programmatic scroll settles.
- The mock imagery is AVIF/WebP (no legacy PNG mocks); imagery is decorative and
  always has explicit dimensions to avoid layout shift.

## Component inventory

Shared chrome: `.top-nav` (fixed, glass), `.top-nav-link`, `.nav-toggle`,
`.theme-toggle`, `.lang-toggle`, `.site-footer`, `.btn*`, `.card`,
`.home-hero`, `.home-cards`, `.section-head`, `.t-*` type scale.

Decoder: `.decoder-hero`, `#dropzone`, `.add-files`, `.toolbar*`, `.file-list`
(always-on grid), `.file-card`, `.status` states, `.preview`, `.filmstrip-thumb`,
`.viewer-*` band/stage/arrows/count, `.failure-card`/failure info, `.toast`,
`.skip-link`, format segmented control
and per-card format select.

Pages: guide article/rail/mockup classes in `guide/guide.css`, privacy legal
layout in `privacy/redesign.css`, home mock in `home-mock.css`, and the 404 page
styles in layer 40.

## Accessibility baseline

Skip link on every page; one visible focus ring token; one grid tab stop with
arrow-key card navigation (per the launch-blocker suite); 44 px touch targets;
reduced-motion support; no-JS notice beside an inert drop card; live regions for
progress/status. Contrast is measured in both themes by the dark-mode and
contrast checks; known exceptions are documented in the review evidence, not
silently ignored.

## Known seams / open design work

- `50-polish.css` is still an override layer; fold it into the owning layers.
- The viewer token set is large; a future pass should trim unused viewer modes
  (`dark-stage`/`inverted`) if they are not product options.
- Guide screenshot/figcaption freshness is a content task tracked in the
  workspace docs status, not a design-system change.
- Browser support copy is not aligned with the tested matrix yet; that is an
  owner decision in `docs/DECISIONS.md` D-010, not a design change.
