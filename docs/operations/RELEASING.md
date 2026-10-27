# Releasing

DocFlow is a monorepo of independently versioned packages published to the
public npm registry under `@kedataindo/docflow-*`. This guide covers the two
things a maintainer maintains over time: the **changelog** and the
**GitHub Releases** (which double as the marketing surface).

For the mechanics of the publish workflow itself, see [`PUBLISH.md`](./PUBLISH.md).

## The changelog

[`CHANGELOG.md`](../../CHANGELOG.md) follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Because the packages version and publish independently (CI patch-bumps each push
to `main`), the changelog is grouped by **date and milestone**, not by a single
semver.

**In every PR that changes behavior**, add a line to the `[Unreleased]` section
under the right heading:

- `Added` — new features, props, commands, ports
- `Changed` — behavior changes to existing APIs
- `Fixed` — bug fixes
- `Removed` / `Deprecated` — removals and planned breakages

Keep entries user-facing: lead with the capability, not the file. Link the issue
or PR (`(#123)`) so readers can follow the trail.

## GitHub Releases

**A push to `main` that ships a package also tags that commit `vYYYY.MM.DD.N`.**

You do not cut that tag. The publish workflow does, after npm accepts the
packages (`.github/workflows/publish.yml`, the `release` job):

- The date is **Asia/Jakarta**. `N` starts at 1 and increments when that day
  already has a release, so two publishes on the same day do not collide.
- The tag points at the commit that was published, not at whatever `main` has
  moved to since.
- It opens a GitHub Release for that tag: notes generated from
  [`.github/release.yml`](../../.github/release.yml) (grouped by label), a
  changelog pointer, and `docs/assets/docflow-demo.gif`.
- A push that changes no package publishes nothing and creates no tag. Docs,
  tests, and CI-only commits stay off the Releases page.
- The tag marks a point in time, not one package version. The six packages
  version independently, so the Release body is the place to read what shipped.

A hand-cut `v*` tag still works, and skips the automatic patch-bump. Use it
only when you intend to ship the versions already in the tree:

```bash
git tag -a v0.0.86 -m "v0.0.86"
git push origin v0.0.86
```

The `release` job is idempotent: re-running it on a tag that already has a
Release is a no-op. GitHub reads `.github/release.yml` from the **default
branch**, so a label change has to be on `main` before the next tag or the
notes come out ungrouped.

A maintainer can still **edit** the Release afterwards to add a human summary.
To create one for a tag that predates the automation:

```bash
gh release create v0.0.86 --generate-notes \
  "docs/assets/docflow-demo.gif#Demo GIF"
```

> **Never** tag or publish from a local, unpushed branch. The workflow verifies
> the tree before it publishes.

## Regenerating the demo GIF

The README GIF is recorded from the playground, not hand-edited:

```bash
pnpm install
pnpm build && pnpm dev         # serve http://localhost:5200
node scripts/record-demo.mjs   # writes docs/assets/docflow-demo.gif
```

The script needs ffmpeg on `PATH` and resolves Playwright from the local install
or the global npm root (`PLAYWRIGHT_PATH` overrides). Keep the GIF under ~8 MB so
GitHub renders it inline; the default settings (900 px wide, 12 fps, 128-colour
palette) stay comfortably inside that budget for a ~60 s demo.
