# Publishing Guide — DocsEditor Packages

All packages are published to the **public npm registry** (`https://registry.npmjs.org`)
under the `@kedataindo` scope. GitHub Packages is **not** used.

## Package List

Source (workspace) packages are named `@kedata-indonesia/docflow-*`. The publish
workflow rewrites names/deps/dist imports to the public `@kedataindo/*` scope:

| Package | Source name | Published as | Description |
|---------|-------------|--------------|-------------|
| core | `@kedata-indonesia/docflow-core` | `@kedataindo/docflow-core` | Headless editor factory, plugin system, collaboration |
| layout-engine | `@kedata-indonesia/docflow-layout-engine` | `@kedataindo/docflow-layout-engine` | Page layout, pagination, auto page break |
| vue | `@kedata-indonesia/docflow-vue` | `@kedataindo/docflow-vue` | Vue 3 components + composables |
| element | `@kedata-indonesia/docflow-element` | `@kedataindo/docflow-element` | Web Component (`<docs-editor>`) |
| plugins | `@kedata-indonesia/docflow-plugins` | `@kedataindo/docflow-plugins` | Built-in editor plugins |
| export | `@kedata-indonesia/docflow-export` | `@kedataindo/docflow-export` | DOCX / ODT / RTF / Markdown export |

## Version policy (what our numbers promise)

Every package is **pre-1.0** and versioned independently (they do not move in
lockstep). Until a package reaches `0.1.0` its version carries no compatibility
promise at all — that is what `0.0.x` means, and it is where the packages sit
today. The rules below are the ones we hold ourselves to as we move out of it:

- **patch** (`0.1.1`): fixes only — same public API, same peer ranges, same
  document schema. A patch must never require the consumer to change code.
- **minor** (`0.2.0`): additive capability. A document produced by the newer
  version may use something an older version does not understand, so downgrading
  is not guaranteed to round-trip.
- **major** (`1.0.0`): the public API, a peer range or the document schema
  changes in a way consumers must act on. The release notes carry the migration
  steps, and anything that cannot be absorbed silently goes out as a prerelease
  first.

Non-negotiables:

- **A breaking change never ships as a patch.** The TipTap v3 migration is the
  incident that made this explicit: peer ranges moved and every host had to bump,
  so it belonged in a minor/major — not in a patch bump (#166).
- **Published versions are immutable.** Never re-tag, re-publish or unpublish a
  version; a mistake is fixed by publishing the next patch.
- **`latest` is the stable channel.** Anything consumers must test before
  adopting goes out as a prerelease on the `next` dist-tag
  (`npm i @kedataindo/docflow-core@next`) and is promoted to `latest` only after
  the app that consumes it has been verified against it.
- **A release should be traceable.** `git tag` ↔ the npm version ↔ the GitHub
  Release notes have to tell one story. That link is loose today: tags are only
  cut for deliberate releases, so three tags cover 100+ published versions.
  Tightening it — a tag and generated notes per release — belongs to the
  Changesets move described below.
- **Deprecation is announced before removal.** A public export that is going away
  is marked `@deprecated` in the types with the replacement named, and is removed
  no earlier than the next major.
- **One release path.** A maintainer merges the version bump (see
  [Landing the bump](#landing-the-bump-main-ruleset)); nobody publishes by hand
  outside the workflow except as the documented emergency fallback.

## Prerequisites

- Node.js >= 20, pnpm >= 9
- npm account with **publish access to the `@kedataindo` scope/org**
- An automation token stored as the `NPM_TOKEN` repository secret
  (used by CI as both `NPM_TOKEN` and `NODE_AUTH_TOKEN`)
- Optional: `RELEASE_TOKEN` — see
  [Why the bump PR needs one click](#why-the-bump-pr-needs-one-click-and-how-to-remove-it).
  Provenance needs no secret: it uses the workflow's OIDC token
  (`permissions: id-token: write`).

## 1. Authenticate (local, optional)

```bash
# Login to the public npm registry
npm login --registry=https://registry.npmjs.org

# Or set in .npmrc
echo "//registry.npmjs.org/:_authToken=YOUR_TOKEN" >> ~/.npmrc
```

## 2. Version Bump

Versions are **bumped automatically** by CI when a change lands on `main` — see
[Auto version bump](#auto-version-bump-push-to-main). You normally never edit
them by hand; manual bumping is only needed for an explicit release.

```bash
# Inspect current versions
grep '"version"' packages/*/package.json

# Manual bump (explicit release only): edit the version, but keep internal
# dependency specifiers as "workspace:*" — CI resolves them at publish time.
```

## 3. Build All Packages

```bash
# From root
pnpm build

# Verify dist outputs exist
ls packages/*/dist/
# → core/dist/, vue/dist/, element/dist/, layout-engine/dist/, plugins/dist/, export/dist/
```

## 4. CI/CD — Automated Publish

Publishing runs via GitHub Actions (`.github/workflows/publish.yml`) to the
**public npm registry only**. It is triggered by:

- **push to `main`** — verify + auto-bump + build + publish, fully unattended
- **push of a `v*` tag** — same flow, minus the auto-bump (tag = explicit release);
  the tag also gets a GitHub Release with the demo GIF attached (see
  [RELEASING.md](./RELEASING.md))
- **manual run** — `workflow_dispatch` from the Actions tab

Publishing is **idempotent per package**: a version already on npm is skipped, so
re-running never hard-fails and a tag release only touches what is new. But a
package the **bump** chose (it is in the run's `bumped` list) that turns out to be
already on npm means the bump read a **stale registry replica** — that **fails the
run** (`::error::`) instead of going green having published nothing (the silent
drop that stranded `vue@0.0.97`). The bump never picks a taken version on purpose
(see [Auto version bump](#auto-version-bump-push-to-main)); a re-run, with a fresh
read, picks a free version. A version the bump deemed free is also re-checked on
npm after publishing: one that never reached the registry fails the run before the
bump is committed back.

### Trigger

```yaml
on:
  push:
    branches: [main]   # auto-publish on merge
    tags: ['v*']       # ...or an explicit release tag
  workflow_dispatch:
```

### What the workflow does

1. On a push to `main`, pins the job to the **current tip of `main`** (a run can
   start after `main` advanced further, and the concurrency group drops
   superseded queued runs), so every later step acts on that one revision.
2. Installs dependencies, then gates the release on `pnpm lint`,
   `pnpm typecheck`, `pnpm test:unit`, `pnpm test:scripts` and
   `pnpm docs:api:check` (broken code is never published).
3. On a push to `main`, patch-bumps the affected packages — see
   [Auto version bump](#auto-version-bump-push-to-main).
4. Runs `pnpm build`.
5. Rewrites every `packages/*/package.json`: source name → `@kedataindo/docflow-*`,
   internal `@kedata-indonesia/*` deps → `@kedataindo/*` (resolving
   `workspace:*` to the local version), and sets
   `publishConfig = { registry: 'https://registry.npmjs.org', access: 'public' }`.
6. Rewrites `dist/**` files, which contain hardcoded `@kedata-indonesia/docflow-*`
   import specifiers after the build.
7. Publishes in dependency order (`core`, `layout-engine`, `plugins`, `vue`,
   `element`, `export`) with `--provenance`: npm stores a signed attestation
   naming the repository, commit and workflow that built each tarball, so a
   consumer can verify where an installed version came from. Publishing is
   **idempotent per package**: a version already on npm
   is skipped — unless the bump chose it, in which case the registry read was
   stale and the run fails rather than going green having published nothing.
8. Restores the original `package.json` files from their `.bak` copies — which
   already carry the bumped version.
9. On a push to `main`, re-checks every bumped version with
   `npm view @kedataindo/docflow-<pkg>@<version>`. Reads travel through npm's
   CDN/read replicas, which can lag several minutes behind an accepted publish,
   so this polls for up to 15 minutes (20s interval): a version that never
   landed fails the run (`::error::`) before the bump is committed back.
10. On a push to `main`, lands those bumped versions on `main` as a pull request
    (`chore(release): bump …`). The commit deliberately carries **no `[skip ci]`**,
    so the required `ci` check reports on it like on any other PR — that leaves
    only the review, which a maintainer supplies with one click (a `RELEASE_TOKEN`
    lets the step merge it unattended instead). While it waits, the run stays
    **green** and reports the PR in the summary: npm is ahead of `main` until that
    click happens, which is a normal state, not an automation failure. See
    [Landing the bump](#landing-the-bump-main-ruleset).

### Publish idempotent (per package)

```bash
VERSION=$(node -e "console.log(JSON.parse(require('fs').readFileSync('./packages/core/package.json.bak','utf8')).version)")
if npm view @kedataindo/docflow-core@$VERSION version --registry=https://registry.npmjs.org &>/dev/null 2>&1; then
  # A version the bump chose must not already exist: that is a stale registry read.
  case ",${BUMPED}," in *",core,"*) echo "::error::stale registry read"; exit 1;; esac
  echo "@kedataindo/docflow-core@$VERSION already published, skipping"
else
  pnpm publish --filter @kedataindo/docflow-core --no-git-checks --access public
fi
```

### Auto version bump (push to `main`)

`scripts/bump-release-versions.mjs` runs on the **current tip of `main`** and
decides what to release from everything that changed **since the last
`chore(release):` commit** (the one this pipeline itself pushes). That anchor is
found with `git log --no-merges`: each release commit lands through a merge whose
message *quotes* the release subject, and matching that merge would move the
anchor past changes merged while a run was in flight — silently marking them
released without ever publishing them. Before the first automated release — or
after a history rewrite that drops it — it falls back to the pushed range
(`github.event.before..HEAD`). The version arithmetic and the registry reads live
in `scripts/lib/release-versions.mjs`:

- A package is **changed** when the range touched its files, ignoring docs
  (`*.md`), tests (`__tests__/`, `*.test.*`, `*.spec.*`) and build output (`dist/`).
- A package is **bumped** when it changed **or** when it depends on a bumped
  package — dependents must be re-released because internal deps are published
  as exact versions (`workspace:*` → the sibling's real version).
- E.g. a change in `packages/core` bumps `core` **and** everything downstream:
  `layout-engine`, `plugins`, `vue`, `element`. (`export` has no internal deps,
  so it only moves when it changes itself.)
- Versions move **independently** (each package owns its `version`) and by a
  **patch**: `0.0.60 → 0.0.61`. A registry that sits on a higher minor/major is
  followed (`0.1.0` on npm → `0.1.1`), so numbers are skipped, never reused.
- The patch is **registry-aware**: the script reads what npm already has
  (`npm view @kedataindo/docflow-<name> versions --json
  --registry=https://registry.npmjs.org`) and lands on a version above every
  version npm already has (a prerelease of the next patch can push it one number
  further). A repo that drifted behind the registry heals itself in a single run
  (`0.0.60` → `0.0.84` while npm is at `0.0.83`) instead of re-bumping into
  versions the publish step would silently skip. Versions npm already treats as
  the same release — including build-metadata forms such as `0.0.2+build.7` — are
  skipped too. If the registry cannot be read, the step **fails**: it never
  assumes a version is free.
- A base that cannot be resolved — the first push of a branch, or a history
  rewrite that removes the release commit and the pushed range — **fails** the
  run rather than reporting "nothing to release" while shipping nothing.
- A package npm has never seen (a brand-new package) keeps the plain bump and
  is published for the first time.
- Nothing publishable changed → nothing is bumped and nothing is published.

Releasing the current tip of `main` (not the run's checkout) and anchoring on the
last release commit means a push that lands while a run is publishing — or a
queued run that gets superseded — is still covered by the next run, as long as a
release commit remains in the branch history.

Preview the decision without writing any file (it does read the public registry,
so it needs network access and fails when npm is unreachable):

```bash
# `auto` = anchor on the last release commit
node scripts/bump-release-versions.mjs auto HEAD --dry-run
```

Unit tests: `pnpm test:scripts`. They never touch npm: `$NPM_PUBLISHED_STUB`
(a JSON map such as `{"core":["0.0.60"]}`, with `"ERROR"` simulating an outage)
answers the registry lookups instead of the network. The script refuses that
variable outside `node --test`, so it cannot quietly disable the check in CI.

### Landing the bump (`main` ruleset)

`main` is protected by the ruleset `protect-default-branch`: every change must go
through a **pull request**, so a direct `git push` from CI is rejected with
`GH013: Changes must be made through a pull request` (incidents: runs
`37709011366` and `37713844249` — both stranded the bump while npm had already
been updated).

The commit-back step therefore:

1. pushes the bump commit to a throwaway branch
   `release/bump-<run-id>-<attempt>`;
2. opens a PR titled `chore(release): bump <packages>`;
3. tries to merge it, and asks GitHub for auto-merge when the repository allows
   it;
4. if the merge did not happen, checks that an **open PR still carries the bump**;
5. re-checks that the bump commit is an ancestor of `main` before declaring
   success.

Two outcomes — only one of them is a failure:

- **merged** → the throwaway branch is deleted and the run is green;
- **waiting for review** → the run is **green**, with a notice and a summary entry
  pointing at the PR. npm already has the versions; `main` catches up when the
  review lands;
- **no open PR carries the bump** → `::error::` and a red run. That is a real
  automation failure: npm is ahead of `main` with nothing tracking it.

#### Why the bump PR needs one click, and how to remove it

`protect-default-branch` requires the **`ci` check** and **one approving review**,
and a bot cannot approve its own PR. The bump commit therefore carries **no
`[skip ci]`** — the check reports on the bump PR like on any other, so the review
is the only thing left. (One side effect: merging the bump triggers one more
publish run. That run finds nothing left to bump and publishes nothing, because
both the publish and the commit-back step are skipped when the bump list is empty;
the cost is a couple of minutes of CI, not a second release.)

To get to zero clicks:

- **`RELEASE_TOKEN`** — a PAT owned by an account with **admin** on the repository,
  whose role is a ruleset *bypass actor*, stored as the repository secret
  `RELEASE_TOKEN`. With it the step merges the bump itself. Create it fine-grained
  (`Contents: read/write`, `Pull requests: read/write`, this repository) or classic
  (`repo` + `workflow`).
  The built-in **GitHub Actions** app (`Integration`, id `15368`) **cannot** be the
  bypass actor on a repository ruleset here — the API rejects it with *"Actor
  GitHub Actions integration must be part of the ruleset source or owner
  organization"* — hence a PAT.
- **Repository auto-merge enabled** — the step already requests it, so the PR lands
  itself as soon as someone reviews. That still costs the review, but never a
  second manual merge.

> **Branch protection alternative:** removing the commit-back step and bumping
> versions by hand is still supported — the publish step stays idempotent, so a
> manual version bump is published on the next merge to `main`.

> **After a release, pull before your next push.** The bot's merge lands a commit
> on `main`, so a stale local `main` is rejected — `git pull --rebase`
> fixes it.

### Cara rilis

```bash
# Default: cukup merge perubahanmu ke `main`.
#   → CI verify, patch-bump paket terdampak, publish, lalu commit bump balik.

# Rilis eksplisit / paksa (tanpa auto-bump):
git tag v0.0.5
git push origin v0.0.5
```

> Bump versi manual di `main` **tidak** terbit apa adanya: `package.json` yang
> berubah dihitung sebagai perubahan paket, lalu di-patch lagi oleh auto-bump
> (bukan `0.0.5`, melainkan versi bebas berikutnya di atas npm). Untuk merilis
> versi yang persis kamu tulis, pakai tag `v*` — auto-bump dilewati, sehingga
> versi di `package.json` terbit apa adanya.

## 5. Verify

```bash
# Check published versions on the public registry
npm view @kedataindo/docflow-core versions
npm view @kedataindo/docflow-vue versions

# Every package publishes the Node floor it was built for (install on an older
# Node prints EBADENGINE instead of failing later inside a bundler)
npm view @kedataindo/docflow-core engines

# Test install in a clean project
mkdir test-install && cd test-install
npm init -y
npm install @kedataindo/docflow-vue
```

## Why not Changesets yet?

[Changesets](https://github.com/changesets/changesets) is the industry standard for
multi-package monorepos: each PR carries a changeset (bump kind + notes), a bot opens
a "Version Packages" PR that updates versions and `CHANGELOG.md`, and publishing
follows the merge of that PR — one human click, tags and release notes included.

The push-triggered workflow already patch-bumps the affected packages from the commit
range (`scripts/bump-release-versions.mjs`), so what is missing is not automation but
**intent**: with every change landing as a patch, a version number carries no signal,
and a breaking change reaches a stable tag looking exactly like a bug fix — the TipTap
v3 migration (#166) shipped as `0.0.98`. Changesets is how the
[version policy](#version-policy-what-our-numbers-promise) gets enforced instead of
merely documented.

What adopting it costs: a changeset file in every PR that touches a package (a habit
for contributors and for coding agents), a `changesets/action` step in this workflow,
and retiring `bump-release-versions.mjs` together with its tests. Recommended as the
next release-machinery change, before the following breaking change has to ship.

## Pre-publish Checklist

- [ ] `pnpm typecheck` passes for all packages
- [ ] `pnpm test:unit` passes for all packages
- [ ] `pnpm build` produces dist/ in all packages
- [ ] `peerDependencies` are correct (no version conflicts)
- [ ] Setiap runtime dependency paket di-`external` di bundler-nya, sehingga tidak
      ikut ter-bundle ke `dist` (`pnpm test:scripts` menjaga
      `packages/*/vite.config.ts`; lihat issue #168)
- [ ] Each `packages/*/package.json` declares the root `engines.node` floor
      (`pnpm test:scripts` guards this, including the workflow Node version)
- [ ] `exports` field includes CSS path (vue package)
- [ ] Perubahan sudah merge ke `main` (versi di-`bump` otomatis oleh CI)
- [ ] CHANGELOG updated (if exists)
- [ ] Tag `v*` dibuat hanya untuk rilis eksplisit (opsional)
