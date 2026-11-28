# Publishing the source mirror

Status: **published** (2026-11-26). `https://github.com/B67687/ithmb-codec-web`
is public, has exactly one commit, a **239-file tree**, and tag `v2.0.0`. It is a
source-audit surface, not a workspace and not a deploy source.

## Invariant: one orphan commit per publish

The mirror is rebuilt from scratch on every publish **as a single orphan
commit**. Never append a second commit, never push a normal development
history, and never let the mirror accumulate history between releases.

Why: the public repo is the auditable snapshot of the shipped source. The dev
repository keeps the real history (plans, reviews, local-only notes). An
append-only mirror would leak that history and make "what exactly is public?"
hard to answer. A fresh orphan commit makes the published tree and its release
tag one reviewable object.

Rules:

- The mirror's `main` always has **one commit**. `git rev-list --count main` must
  return `1` in the mirror.
- The release tag (`vX.Y.Z`) points at that commit. A republish replaces both the
  commit and the tag for that release.
- The deployed site and the mirror are built from the **same verified tree** at
  the same SHA. Neither is derived from the other. The deploy is a direct upload
  of `_site`; record its SHA-256 manifest with the release SHA in the runbook.
- The mirror is never a Cloudflare Pages source and runs no CI.

## What may cross

`public-manifest.txt` is the allowlist: the mirror contains exactly the tracked
files not listed in `.publicignore`. `scripts/check-public-tree.mts` enforces
this and scans for leak patterns (dev-repo names, local paths, secret-looking
strings).

Excluded on purpose (`.publicignore`): the runbook (account and project names),
the deploy-artifact builder, the post-deploy probe, the extension harness, the
publish/parity tooling, the stale journey script, encrypted env files and the
agent workspace.

## Publish steps (owner, from a clean release checkout)

1. Check out the release SHA on a clean tree; confirm the push CI run for
   `redesign/apple-tiles` at that SHA (the branch is in the push filter), and run
   the local gates from `docs/RUNBOOK.md` preconditions if needed. Record the SHA.
2. Run `bun scripts/check-public-tree.mts`. It must exit 0.
3. Create the mirror tree with exactly the allowlisted files (a new orphan
   branch/worktree is the safe way; do not copy `.git` or ignored files).
4. Commit that tree as one commit on a new orphan branch. Suggested subject:
   `release: vX.Y.Z`.
5. Create the signed tag `vX.Y.Z` on that commit.
6. Force-push the orphan commit to the mirror's `main` and push the tag:
   `git push public <orphan-branch>:main --force-with-lease` then
   `git push public vX.Y.Z --force`.
7. Verify anonymously (logged-out browser or a shell without cached
   credentials):
   - `https://github.com/B67687/ithmb-codec-web` returns 200.
   - `https://api.github.com/repos/B67687/ithmb-codec-web` reports `"visibility":
     "public"`, default branch `main`, **1 commit**, and a **239-file** tree for
     the current release.
   - the tag `vX.Y.Z` exists and points at that commit.
   - the tree is identical to the release tree (diff allowlisted paths only).
   - the footer "Website source" link, privacy sections that link the source,
     and the JSON-LD `sameAs` entries resolve.
8. Only after the mirror and the deploy both verify, re-add or keep the custom
   domain as appropriate.

## If the mirror is ever removed

If the source links are stripped instead of published, update the footer, the
privacy page, the JSON-LD `sameAs` list, the README badges/links and
`SECURITY.md` in the same change. A page that claims an unavailable source repo
is worse than no link.

## Notes and open items

- Rebuilding the mirror is a manual owner step; there is no script in this repo
  that performs it (deliberate: it needs the public remote and a signed tag).
- The mirror has no history by design, so release notes must live in the dev
  repo's `CHANGELOG.md` and on the GitHub release/tag.
- `v2.0.0` is the current mirror tag; `package.json` (`2.0.0`) and `SECURITY.md`
  (`2.0.x`) now match it, so the earlier version drift is closed. Do not tag a
  new mirror release without bumping package/changelog/security together.
- The mirror is manual and rebuilds the whole tree; a tree-count check
  (`git ls-tree -r --name-only HEAD | wc -l` in the mirror) should match the
  non-comment lines of `public-manifest.txt` (239 entries at the current release).
