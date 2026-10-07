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

## Prerequisites

- Node.js >= 20, pnpm >= 10
- npm account with **publish access to the `@kedataindo` scope/org**
- An automation token stored as the `NPM_TOKEN` repository secret
  (used by CI as both `NPM_TOKEN` and `NODE_AUTH_TOKEN`)

## 1. Authenticate (local, optional)

```bash
# Login to the public npm registry
npm login --registry=https://registry.npmjs.org

# Or set in .npmrc
echo "//registry.npmjs.org/:_authToken=YOUR_TOKEN" >> ~/.npmrc
```

## 2. Version Bump

```bash
# Check current versions
grep '"version"' packages/*/package.json

# Bump version in ALL package.json files that changed
# (edit packages/*/package.json; keep internal deps as "workspace:*")
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

- **push to `main`** — verify + build + publish, unattended (the default path)
- **push of a `v*` tag** — same flow, kept for explicit/forced releases
- **manual run** — `workflow_dispatch` from the Actions tab

Publishing is **idempotent**: a package whose exact version is already on npm is
skipped. A push therefore publishes only packages that carry a *new* `version`
— bump those in the PR that introduces the change.

### Trigger

```yaml
on:
  push:
    branches: [main]   # auto-publish on merge
    tags: ['v*']       # ...or an explicit release tag
  workflow_dispatch:
```

### What the workflow does

1. Installs dependencies, then gates the release on `pnpm docs:api:check`,
   `pnpm lint`, `pnpm typecheck` and `pnpm test:unit` (broken code is never
   published), and finally runs `pnpm build`.
2. Rewrites every `packages/*/package.json`: source name → `@kedataindo/docflow-*`,
   internal `@kedata-indonesia/*` deps → `@kedataindo/*` (resolving
   `workspace:*` to the local version), and sets
   `publishConfig = { registry: 'https://registry.npmjs.org', access: 'public' }`.
3. Rewrites `dist/**` files, which contain hardcoded `@kedata-indonesia/docflow-*`
   import specifiers after the build.
4. Publishes in dependency order (`core`, `layout-engine`, `plugins`, `vue`,
   `element`, `export`), **idempotently**: if the version already exists on npm,
   it is skipped instead of hard-failing.
5. Restores the original `package.json` files from their `.bak` copies.

### Publish idempotent (per package)

```bash
VERSION=$(node -e "console.log(JSON.parse(require('fs').readFileSync('./packages/core/package.json.bak','utf8')).version)")
if npm view @kedataindo/docflow-core@$VERSION version --registry=https://registry.npmjs.org &>/dev/null 2>&1; then
  echo "@kedataindo/docflow-core@$VERSION already published, skipping"
else
  pnpm publish --filter @kedataindo/docflow-core --no-git-checks --access public
fi
```

### Cara rilis

```bash
# 1. Bump versi paket yang berubah (edit packages/*/package.json)
grep '"version"' packages/*/package.json

# 2. Commit + push ke main → workflow publish jalan otomatis
git add packages/*/package.json
git commit -m "chore: release vX.Y.Z"
git push

# (Opsional) paksa rilis lewat tag:
# git tag v0.0.5 && git push --tags
```

Push tanpa perubahan versi tetap aman: semua paket akan di-skip karena
versinya sudah ada di npm.

## 5. Verify

```bash
# Check published versions on the public registry
npm view @kedataindo/docflow-core versions
npm view @kedataindo/docflow-vue versions

# Test install in a clean project
mkdir test-install && cd test-install
npm init -y
npm install @kedataindo/docflow-vue
```

## Why not Changesets yet?

Long term, [Changesets](https://github.com/changesets/changesets) is the industry
standard for multi-package monorepos: contributors add a changeset per PR, then a
workflow bumps + publishes only the changed packages. Not needed yet —
idempotent + push-triggered is enough at the current scale.

## Pre-publish Checklist

- [ ] `pnpm typecheck` passes for all packages
- [ ] `pnpm test:unit` passes for all packages
- [ ] `pnpm build` produces dist/ in all packages
- [ ] `peerDependencies` are correct (no version conflicts)
- [ ] `exports` field includes CSS path (vue package)
- [ ] Version bumped di `package.json` paket yang berubah
- [ ] CHANGELOG updated (if exists)
- [ ] Versi di-`bump` pada paket yang berubah & di-push ke `main` (tag `v*` opsional)
