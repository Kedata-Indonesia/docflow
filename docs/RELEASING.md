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
Creating a Release is also where the demo GIF gets attached — treat every release
as a small launch.

1. Make sure `[Unreleased]` is up to date, then move its entries under a new
   dated heading (`## [YYYY-MM-DD]`) and commit.
2. Create and push an annotated tag. A `v*` tag runs the publish workflow without
   the automatic patch-bump, so use the version you intend to ship:

   ```bash
   git tag -a v0.0.86 -m "v0.0.86"
   git push origin v0.0.86
   ```

3. Open a Release for the tag and let GitHub generate the notes
   (`.github/release.yml` groups them by label). Add a one-line summary at the
   top and paste the corresponding changelog section.
4. Attach the current `docs/assets/docflow-demo.gif` to the Release so the
   announcement is self-contained.

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
