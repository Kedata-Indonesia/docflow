# Releasing

DocFlow is a monorepo of independently versioned packages published to the
public npm registry under `@kedataindo/docflow-*`. This guide covers the two
things a maintainer maintains over time: the **changelog** and the
**GitHub Releases** (which double as the marketing surface).

For the mechanics of the publish workflow itself, see [`PUBLISH.md`](./PUBLISH.md).

## The changelog

[`CHANGELOG.md`](../CHANGELOG.md) follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
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

Releases are cut from `main` and tagged so consumers can pin a point in time.
A `v*` tag also becomes a GitHub Release automatically — with label-grouped
notes and the demo GIF attached — so treat every release as a small launch.

1. Make sure `[Unreleased]` is up to date, then move its entries under a new
   dated heading (`## [YYYY-MM-DD]`) and commit.
2. Create and push an annotated tag. A `v*` tag runs the publish workflow without
   the automatic patch-bump, so use the version you intend to ship:

   ```bash
   git tag -a v0.0.86 -m "v0.0.86"
   git push origin v0.0.86
   ```

3. The workflow takes it from there: once the packages reach npm, its `release`
   job creates the Release for the tag — notes generated from
   [`.github/release.yml`](../.github/release.yml) (grouped by label), a
   changelog pointer prepended, and `docs/assets/docflow-demo.gif` attached. The
   step is idempotent, so re-running the workflow on an announced tag is a no-op.

   A maintainer can still **edit** the Release afterwards to add a human summary
   or extra assets. To create one manually (e.g. for a tag that predates the
   automation), attach the GIF the same way:

   ```bash
   gh release create v0.0.86 --generate-notes \
     "docs/assets/docflow-demo.gif#Demo GIF"
   ```

> **Never** tag or publish from a local, unpushed branch. The workflow verifies
> the tree before it publishes.

## Regenerating the demo GIF

The README GIF is recorded from the playground, not hand-edited:

```bash
pnpm playground:restore        # once, from a fresh clone
pnpm build && pnpm dev         # serve http://localhost:5200
node scripts/record-demo.mjs   # writes docs/assets/docflow-demo.gif
```

The script needs ffmpeg on `PATH` and resolves Playwright from the local install
or the global npm root (`PLAYWRIGHT_PATH` overrides). Keep the GIF under ~8 MB so
GitHub renders it inline; the default settings (900 px wide, 12 fps, 128-colour
palette) stay comfortably inside that budget for a ~60 s demo.
