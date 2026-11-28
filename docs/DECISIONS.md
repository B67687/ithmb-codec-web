# Decision Record

Why this project is built the way it is. Each entry records the context, the
choice, the consequences we accept, and its status. This is the canonical
rationale document; `docs/adr/` keeps the dated technical decision records that
predate or underpin these entries.

Last verified: 2026-11-28 against the live site (`https://ithmb-codec.dev`) and
the `redesign/apple-tiles` tree at `30a58d6`. When a decision changes, edit this
file in the same change that changes the code.

Status values: **accepted** (in force), **open** (owner decision still to make),
**superseded** (kept for history, no longer in force).

---

## D-001 Static, no-framework multi-page site

**Status:** accepted (shipped in the 2026-11-26 redesign)

**Context.** The public surface is a handful of content pages plus one decoder.
A client-side framework would add a runtime payload, a build-time dependency
chain, and a hydration/flash risk for pages that are mostly text. The site must
work for crawlers and no-JS visitors.

**Decision.** Ship plain HTML pages with hand-authored CSS. There is no runtime
framework: every package in `package.json` is a devDependency, and the build is a
TypeScript transform plus a small amount of generation (`scripts/build.mts`).
The only client application is the decoder, loaded from `ithmb-decoder/`.

**Consequences.**
- No framework upgrades and no hydration; the cost is hand-written DOM code and
  manual routing, which the module map in `ARCHITECTURE.md` keeps small.
- Page copy is server-rendered in the HTML; the decoder is the only
  locale-driven surface (`tests/copy-sources.spec.ts` enforces this split).
- New pages need explicit links, canonical/hreflang metadata and a route entry;
  `src/routes.ts` is the single source for EN/ZH pairs.

**Evidence:** `package.json`, `scripts/build.mts`, `src/routes.ts`, `src/shell.ts`.

---

## D-002 Curated `_site` artifact is the only deployable tree

**Status:** accepted (shipped 2026-11-26)

**Context.** Serving the repository root exposed source, tests, scripts, docs
and local-only files. The Cloudflare Pages project must receive a tree that
contains exactly what a visitor may fetch.

**Decision.** `bun run build:pages` runs the normal build, then
`scripts/build-site.mts` copies an explicit allowlist of site files into
`_site/`. The builder rejects any path that matches a forbidden pattern (source
extensions, `tests`, `docs`, `scripts`, dotfiles, package metadata) and fails if
a required page is missing. Only `_site/` is uploaded to Cloudflare Pages; the
repository root is never a web root.

**Consequences.**
- Adding a new public asset means adding it to `ROOT_FILES` or `SITE_DIRS` in
  `scripts/build-site.mts`; otherwise it silently does not ship.
- The current artifact is 89 files. `_site/` is generated and disposable.
- The allowlist is also the leak boundary; the post-deploy probe re-checks
  denied paths on the real host.

**Evidence:** `scripts/build-site.mts`, `_site/` (89 files),
`docs/RUNBOOK.md`, `scripts/post-deploy-probe.mjs`.

---

## D-003 No contribution, upload, or telemetry flow

**Status:** accepted (feature removed 2026-11-24)

**Context.** The product is a decoder for private photo thumbnails. An earlier
opt-in "Share 16 bytes / Share full file / Report issue" flow required a
Cloudflare Worker, KV storage, rate limits, IP hashing, a dashboard and a
retention story. It was removed end to end.

**Decision.** The live site has no upload endpoint, no contribution endpoint and
no telemetry worker. Failed decodes show an informational failure card with the
reason, the prefix/size actually read, and links to GitHub issues, the guide and
the privacy page. Bug reports happen through GitHub issues.

**Consequences.**
- Support relies on users opening an issue; there is no passive diagnostic data.
- The privacy claim is absolute: files never leave the browser.
- Documentation that described the contribution flow is obsolete; historical
  entries stay in `CHANGELOG.md` only.

**Evidence:** `ithmb-decoder/failure-info.ts`, `tests/decode-failure.spec.ts`,
`SECURITY.md`, `docs/FEATURES.md` (no share/report feature).

---

## D-004 No analytics, cookies, or third-party runtime assets

**Status:** accepted (in place at launch)

**Context.** A private recovery tool should not identify its visitors, and the
privacy page promises no tracking.

**Decision.** No client analytics, no cookies, no tag managers or third-party
scripts. The only network requests are same-origin assets. Cloudflare Web
Analytics is off. Host-level request metadata (IP, URL, User-Agent, headers,
timestamp) exists because a hosting provider processes requests, and Cloudflare
NEL reporting is disclosed in the privacy page. If traffic data is ever needed,
use Cloudflare zone-level request counts and Google Search Console, not client
analytics.

**Consequences.**
- No product analytics, funnels or error reporting; issues and beta feedback are
  the only signal.
- The beacon toggle is a dashboard setting: it must be re-checked after every
  deploy (the post-deploy probe fails if a beacon appears).
- Two `localStorage` keys only: `ithmbLang` and `ithmbTheme`.

**Evidence:** `_headers`, `scripts/post-deploy-probe.mjs` (beacon checks),
privacy page, and the analytics-access note in the dev workspace.

---

## D-005 Local-only privacy stance

**Status:** accepted

**Context.** Decoding must be trustworthy for files users cannot otherwise open.
Sending thumbnails to a server would create a data-protection surface the
project does not want.

**Decision.** All decoding runs in the browser via WebAssembly. No accounts, no
server-side decoding, no file storage. The only server-side processing is the
host serving static files and normal request metadata. The privacy page
describes the controller, legal basis, retention of host logs and user rights;
its full legal wording is maintained separately from this decision record.

**Consequences.**
- Every feature that would need a backend is out of scope or needs an explicit
  new decision (see D-003 and D-013).
- Browser memory and device limits are the hard limits (see D-009).

**Evidence:** `SPECIFICATION.md` §0, privacy page, `SECURITY.md`.

---

## D-006 Public mirror is one orphan commit, rebuilt on every publish

**Status:** accepted (published 2026-11-26; `v2.0.0`)

**Context.** The public repository is a source-audit surface, not a workspace
and not a deploy source. An appended public history would expose the internal
process (plans, local-only notes, agent workspace) and make "what is published"
hard to audit.

**Decision.** `github.com/B67687/ithmb-codec-web` contains exactly one orphan
commit and a version tag, rebuilt from the verified allowlisted tree on every
publish. Never append a second commit: publish replaces `main` with a fresh
orphan commit and force-updates the tag for that release. `public-manifest.txt`
lists every file that may cross; `.publicignore` lists dev-only paths.
`scripts/check-public-tree.mts` is the gate.

**Consequences.**
- The mirror has no useful history; the dev repo is the history of record.
- Every publish must start from a clean, verified SHA; partial or additive
  mirror commits are a process failure.
- The mirror runs no CI and is not built by Cloudflare Pages.
- The source links in the footer, privacy page and JSON-LD assume the mirror is
  public and current; a castaway mirror is worse than no mirror.

**Evidence:** `docs/SOURCE-PUBLISH.md`, `public-manifest.txt`, `.publicignore`,
`scripts/check-public-tree.mts`; GitHub API reports `visibility: public`,
1 commit, tag `v2.0.0`.

---

## D-007 Cloudflare Pages for static hosting

**Status:** accepted

**Context.** The site is static, needs a custom domain with HTTPS, per-path
headers, redirects, a branded 404 and cheap global delivery. A traditional
server or a client-rendered host would add runtime surface and cost.

**Decision.** Host on Cloudflare Pages at `ithmb-codec.dev`. Deploy the curated
`_site` by direct upload (`wrangler pages deploy _site --branch preview|release`),
not by a Pages-side build. Security headers, CSP and cache policy ship in
`_headers`; URL rules ship in `_redirects`. Production deployments are proven on
a preview first and probed with `scripts/post-deploy-probe.mjs` before the
custom domain is attached or re-attached. Rollback is the previous Pages
deployment.

**Consequences.**
- The Pages project has no Git integration and no build command in the
  repository (there is no `wrangler.toml`); project settings live in the
  dashboard and are documented in `docs/RUNBOOK.md`. This is a known
  single-point-of-configuration risk.
- A bad artifact is fixed by redeploying a known-good `_site` or rolling back;
  a privacy regression means detaching the custom domain first.
- The hosting account, token storage, domain re-add and probe procedure are
  owner-only operations, documented in the runbook.

**Evidence:** `_headers`, `_redirects`, `scripts/build-site.mts`,
`scripts/post-deploy-probe.mjs`, `docs/RUNBOOK.md`.

---

## D-008 Decoder is a Rust core compiled to WASM, with a hand-adapted loader

**Status:** accepted

**Context.** Format knowledge belongs in one place and needs to be shared with
the CLI, Python bindings and the ImageGlass plugin. The browser needs the same
decoders without a second implementation.

**Decision.** `ithmb-core` (Rust, separate repo) is the only decoder
implementation. `crates/ithmb-wasm` is compiled with wasm-bindgen and only
`ithmb_wasm_bg.wasm` is copied into this repo. The JS loader and
`ithmb_wasm_bg.js` glue are hand-adapted and must not be replaced by a fresh
wasm-pack output. Per-profile frame sizes/strides for the web data-integrity
checks are generated from the codec's `profiles.json` by
`scripts/gen-profile-table.mts` into `ithmb-decoder/profiles.ts`.
`scripts/check-wasm-drift.sh` fails if the committed wasm imports are not all
provided by the glue.

**Consequences.**
- A codec change requires a deliberate wasm copy, profile-table regeneration and
  the drift gate; the web repo does not build Rust.
- The browser can only use APIs the wasm binding exposes; container formats and
  frame selection need codec-side work (D-013).
- The wasm binary is committed (247,247 B decoded, ~91 KB Brotli on the wire);
  the format is versioned with the page assets.

**Evidence:** `scripts/gen-profile-table.mts`,
`scripts/check-wasm-drift.sh`, `ithmb-decoder/ithmb_wasm.js`,
`SPECIFICATION.md` §5.

---

## D-009 Profile, format, and session support boundaries

**Status:** accepted (limits are product scope, not bugs)

**Context.** `.ithmb` covers several containers and dozens of device-specific
raw formats, some undocumented. The browser must not invent pixels or promise
what it cannot decode.

**Decision.**
- **Profiles:** 53 active device profiles (a 54th, prefix 1044, is defined and
  disabled). `profiles.ts` is generated from the codec and checked by unit
  tests.
- **Decoders:** 8 pixel formats — RGB565, RGB555, ReorderedRGB555, UYVY,
  YCbCr420, CLCL, CL, and JPEG-embedded T-prefix files.
- **Multi-frame F-prefix files:** the browser decodes the first frame only; the
  CLI extracts a chosen frame. The codec API for frame count/index is not in the
  browser yet.
- **Databases:** PhotoDB/ArtworkDB magic is recognised and shown as an "Apple
  database file" card. The browser does not parse or decode PhotoData folders.
- **Inputs:** 8 MB per file, 200 files and 256 MB of accepted raw bytes per
  session; filmstrip capped at 50 thumbs; ZIP above 100 MB asks for confirmation.
- **Honesty:** an unknown prefix whose payload length is near a known profile is
  rejected rather than guessed; failures show what was read.

**Consequences.**
- Some valid `.ithmb` files are out of scope in the browser; the failure card
  says so and points at the guide/GitHub.
- Multi-frame and PhotoData requests recur until D-013 lands; the answer is the
  same until then.
- The limits live in one module (`ithmb-decoder/limits.ts`) and the guide/FAQ
  should repeat them when copy is next edited.

**Evidence:** `ithmb-decoder/profiles.ts`, `ithmb-decoder/limits.ts`,
`ithmb-decoder/decode-pipeline.ts`, `tests/unit/decode-pipeline.test.ts`,
`tests/decoder-integrity.spec.ts`.

---

## D-010 Browser support claims follow the tested matrix

**Status:** open (copy alignment pending)

**Context.** CI runs Chromium on push and pull requests, Firefox on pull
requests, and WebKit in two shards on pull requests. Local runs use Chromium and
Firefox. Real iOS/Android Safari and Edge have not been tested by automation.
Some guide copy still says Chrome, Firefox, Safari and Edge all work; the
decoder page and Chinese copy say Chrome and Firefox were tested.

**Decision (proposed).** Claim only the browsers actually tested: current Chrome
and Firefox, with WebKit exercised by the CI matrix. Do not claim Safari or Edge
until a manual matrix run is recorded. Site copy should be aligned in a separate
copy pass (this pass does not edit site copy).

**Consequences.**
- Until the copy is aligned, the guide over-promises relative to the tested
  matrix. Recorded as an open owner decision.
- If a browser claim is added later, it needs a dated test record (manual matrix
  or CI job), not inference from engine family.

**Evidence:** `.github/workflows/ci.yml`, `playwright.config.ts`,
`guide/how-to-open-ithmb-files.html`, `ithmb-decoder/index.html`,
`docs/TEST_STRATEGY.md`.

---

## D-011 Chinese is a parallel original, not a runtime translation

**Status:** accepted (native rewrite shipped 2026-11-26)

**Context.** The `/zh/` tree is server-rendered. Copy that read as translated
English was rejected in review before launch.

**Decision.** EN and ZH are separate, server-rendered pages. Chinese copy is
written to read as Chinese, not translated sentence by sentence, and is reviewed
for naturalness before shipping. The language switcher links between canonical
page pairs from `src/routes.ts`; there is no client-side text swap and no `?lang=`
URL. `scripts/check-i18n.mts` and `scripts/check-mirror-parity.mts` gate key
parity, embedded defaults, page pairing, `lang`, canonical and hreflang. A root
`404.html` plus `assets/js/404-lang.js` serves the localized 404.
**Consequences.**
- Every copy change needs both versions; parity gates catch missing keys and
  broken page pairs but cannot judge tone.
- Long-form Chinese prose still benefits from a native-speaker pass; treat that
  as ongoing copy work, not a launch gate.
- The privacy page's Chinese wording is part of the privacy/legal document and is
  not changed by this decision record.

**Evidence:** `zh/`, `src/routes.ts`, `assets/js/404-lang.js`,
`scripts/check-mirror-parity.mts`.

---

## D-012 Performance budgets

**Status:** accepted (launch gates; re-measure on real devices)

**Context.** The decoder ships a WASM binary and a font; a slow first load would
make the tool feel unsafe on the low-bandwidth connections its users may have.

**Decision.** Hold these budgets, measured locally by `tests/perf-budget.spec.ts`
(Chromium only) and on the host model (400 kbps, 300 ms RTT, 4× CPU):
- Home: local LCP < 1.5 s; host LCP < 2.5 s at 400 kbps; font transfer ≤ 80 KB;
  home total transfer < 320 KB local.
- Decoder: ready (WASM compiled + app booted) < 5 s local; JS < 220 KB; total
  < 900 KB local; WASM < 300 KB; exactly one WASM request and one locale fetch.
- Measured launch baseline (2026-11-27): home LCP ≈ 2.3 s at 400 kbps, decoder
  ready ≈ 4.8 s, font 39,736 B (~40 KB).
- Perf work must keep the font, WASM and duplicate-request invariants; layout
  and copy changes re-measure rather than assume.

**Consequences.**
- New mocks or fonts can break the gate; add them as AVIF/WebP and subset fonts.
- Budgets cover Chromium; Safari/iOS performance is a device-test item (open).
- Streaming ZIP and critical-CSS splits are post-launch improvements, not launch
  requirements.

**Evidence:** `tests/perf-budget.spec.ts` and the launch performance run recorded in
the dev workspace.

---

## D-013 PhotoData / PhotoDB is not a browser feature yet

**Status:** open (owner decision: fund the codec work or leave the limit)

**Context.** PhotoData folders pair thumbnail files with PhotoDB/ArtworkDB
databases. The browser receives one file at a time and the wasm binding does not
expose container parsing or entry-to-file mapping. Codec issue #15 (external
reference ArtworkDB misparse) must be fixed first.

**Decision (current behaviour).** Do not promise PhotoData import. Recognise
database magic, show the "Apple database file" card, and point users at the
desktop/CLI tools. Revisit only after the codec exposes a container API and
multi-frame fundamentals are in place.

**Consequences.**
- The guide and FAQ must not imply folder import; a wording pass is pending the
  next copy change.
- Beta users with real PhotoData folders are the readiest evidence for whether
  this work is worth funding.
- Frame selection (first frame only today) is the same codec-side dependency.

**Evidence:** `docs/FEATURES.md` failure/database contract,
`ithmb-decoder/decode-pipeline.ts`, the launch review triage in the dev workspace
(MT-003/004, codec #15), and the 2026-11-27 situation note.

---

## Open decisions from this pass

- **D-010 browser copy alignment**: change guide copy from "Chrome, Firefox,
  Safari and Edge all work" to the tested matrix, or record a manual Safari/Edge
  matrix. Site copy is out of scope for this documentation pass.
- **D-013 PhotoData funding**: fix codec #15 and expose the container API, or
  keep the browser limited to single-file thumbnails.
- **Privacy page depth**: the privacy policy's legal wording is maintained
  separately from this record; shortening it is an owner decision, not a docs
  cleanup.

Resolved since the last pass: the version drift is closed — `package.json`
(`2.0.0`), `SECURITY.md` (`2.0.x`) and the mirror tag `v2.0.0` agree.
