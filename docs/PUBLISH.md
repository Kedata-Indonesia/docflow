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
**public npm registry only**, and is **tag-gated**: it runs on `push` of a
`v*` tag (or a manual `workflow_dispatch`) — never on a plain push to `main`.
This is deliberate:

- Every release is conscious: bump version → tag → push → publish
- Avoids "cannot publish over existing version" when a merge happens without a bump
- The version is tied to a release decision, not to the merge rhythm

### Trigger

```yaml
on:
  push:
    tags: ['v*']   # only tags like v0.1.0, v1.2.3, ...
  workflow_dispatch:
```

### What the workflow does

1. Installs dependencies and runs `pnpm build`.
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

# 2. Commit + push
git add packages/*/package.json
git commit -m "chore: bump versions for release"
git push

# 3. Tag + push tag → trigger publish
git tag v0.0.5
git push --tags
```

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
workflow bumps + publishes only the changed packages. Not needed yet — tag-gated
+ idempotent is enough at the current scale.

## Pre-publish Checklist

- [ ] `pnpm typecheck` passes for all packages
- [ ] `pnpm test:unit` passes for all packages
- [ ] `pnpm build` produces dist/ in all packages
- [ ] `peerDependencies` are correct (no version conflicts)
- [ ] `exports` field includes CSS path (vue package)
- [ ] Version bumped di `package.json` paket yang berubah
- [ ] CHANGELOG updated (if exists)
- [ ] Git tag dibuat: `git tag v0.1.0 && git push --tags`
