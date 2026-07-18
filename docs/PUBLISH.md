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

- Node.js >= 20, pnpm >= 10
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

## 6. CI/CD — Automated Publish

Publish berjalan otomatis via GitHub Actions (`.github/workflows/publish.yml`) **hanya saat tag rilis dipush** — bukan setiap push ke main. Ini keputusan disengaja:

- Setiap publish harus sadar: bump versi → tag → push → publish
- Mencegah "cannot publish over existing version" yang terjadi kalau publish setiap merge tanpa bump
- Versi terikat ke keputusan rilis, bukan ritme merge

### Trigger

```yaml
on:
  push:
    tags: ['v*']   # hanya tag v0.1.0, v1.2.3, dst.
```

### Publish idempotent

Setiap step publish mengecek registry dulu — kalau versi sudah ada, skip. Ini memungkinkan kamu hanya menaikkan versi sebagian paket, dan workflow tidak hard-fail:

```yaml
- name: Publish core (idempotent)
  run: |
    VERSION=$(node -e "console.log(require('./packages/core/package.json').version)")
    if npm view @kedata-indonesia/docflow-core@$VERSION version &>/dev/null 2>&1; then
      echo "@kedata-indonesia/docflow-core@$VERSION already published, skipping"
    else
      echo "Publishing @kedata-indonesia/docflow-core@$VERSION..."
      pnpm publish --filter @kedata-indonesia/docflow-core --no-git-checks
    fi
  env:
    NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Cara rilis

```bash
# 1. Bump versi paket yang berubah (edit packages/*/package.json)
#    Cek versi saat ini:
grep '"version"' packages/*/package.json

# 2. Commit + push
git add packages/*/package.json
git commit -m "chore: bump versions for release"
git push

# 3. Tag + push tag → trigger publish
git tag v0.0.5
git push --tags
```

### Kenapa tidak Changesets dulu?

Untuk jangka panjang, [Changesets](https://github.com/changesets/changesets) adalah standar industri untuk monorepo multi-paket. Kontributor menambah changeset per PR, lalu workflow otomatis bump + publish hanya paket yang berubah. Belum diperlukan sekarang—tag-gated + idempotent sudah cukup untuk skala saat ini.

## Pre-publish Checklist

- [ ] `pnpm typecheck` passes for all packages
- [ ] `pnpm test:unit` passes for all packages
- [ ] `pnpm build` produces dist/ in all packages
- [ ] `peerDependencies` are correct (no version conflicts)
- [ ] `exports` field includes CSS path (vue package)
- [ ] Version bumped di `package.json` paket yang berubah
- [ ] CHANGELOG updated (if exists)
- [ ] Git tag dibuat: `git tag v0.1.0 && git push --tags`
