# Publishing Guide — DocsEditor Packages

## Package List

| Package | NPM Name | Description |
|---------|----------|-------------|
| core | `@kedata-indonesia/docflow-core` | Headless editor factory, plugin system, collaboration |
| layout-engine | `@kedata-indonesia/docflow-layout-engine` | Page layout, pagination, auto page break |
| vue | `@kedata-indonesia/docflow-vue` | Vue 3 components + composables |
| element | `@kedata-indonesia/docflow-element` | Web Component (`<docs-editor>`) |
| plugins | `@kedata-indonesia/docflow-plugins` | Built-in editor plugins |

## Prerequisites

- Node.js >= 20, pnpm >= 9
- GitHub account with access to `@kedata-indonesia` org
- GitHub Personal Access Token with `write:packages` scope

## 1. Authenticate with GitHub Packages

```bash
# Login to GitHub Packages
npm login --registry=https://npm.pkg.github.com
# Username: your-github-username
# Password: your-github-personal-access-token

# Or set in .npmrc
echo "@kedata-indonesia:registry=https://npm.pkg.github.com" >> ~/.npmrc
echo "//npm.pkg.github.com/:_authToken=YOUR_TOKEN" >> ~/.npmrc
```

## 2. Version Bump

```bash
# Check current versions
grep '"version"' packages/*/package.json

# Bump version in ALL package.json files
# Example: bump from 0.0.1 to 0.1.0
# Edit packages/core/package.json, packages/vue/package.json, etc.

# Or use a script:
for pkg in packages/*/package.json apps/server/package.json; do
  # Update version field
done
```

## 3. Build All Packages

```bash
# From root
pnpm build

# Verify dist outputs exist
ls packages/*/dist/
# → core/dist/, vue/dist/, element/dist/, layout-engine/dist/, plugins/dist/
```

## 4. Publish

```bash
# Publish each package individually (pnpm converts workspace:* to versions)
pnpm --filter @kedata-indonesia/docflow-core publish --no-git-checks
pnpm --filter @kedata-indonesia/docflow-layout-engine publish --no-git-checks
pnpm --filter @kedata-indonesia/docflow-plugins publish --no-git-checks
pnpm --filter @kedata-indonesia/docflow-vue publish --no-git-checks
pnpm --filter @kedata-indonesia/docflow-element publish --no-git-checks
```

> **Note**: `apps/server` is `"private": true` — not published. It's a backend service, not a library.

## 5. Verify

```bash
# Check published versions
npm view @kedata-indonesia/docflow-core versions
npm view @kedata-indonesia/docflow-vue versions

# Test install in a clean project
mkdir test-install && cd test-install
npm init -y
echo "@kedata-indonesia:registry=https://npm.pkg.github.com" >> .npmrc
npm install @kedata-indonesia/docflow-vue
```

## 6. GitHub Actions (CI/CD)

`.github/workflows/publish.yml`:

```yaml
name: Publish Packages

on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: https://npm.pkg.github.com
          cache: pnpm

      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm -r publish --no-git-checks
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Pre-publish Checklist

- [ ] `pnpm typecheck` passes for all packages
- [ ] `pnpm test:unit` passes for all packages
- [ ] `pnpm build` produces dist/ in all packages
- [ ] `peerDependencies` are correct (no version conflicts)
- [ ] `exports` field includes CSS path (vue package)
- [ ] Version bumped in all package.json
- [ ] CHANGELOG updated (if exists)
- [ ] Git tag created (`git tag v0.1.0 && git push --tags`)
