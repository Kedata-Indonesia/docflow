/**
 * Static guard for the published manifests: every package under `packages/*`
 * must declare the same Node floor the repository already assumes.
 *
 * `engines` is only a warning at install time, but that warning is the whole
 * point — it turns "a consumer on Node 18 hits a confusing syntax error inside
 * a bundler" into "npm prints EBADENGINE at install". The root manifest carried
 * the floor while the six published manifests carried none, so the checks below
 * exist to keep the two from drifting apart again.
 *
 * The manifests are read as JSON on purpose (no lockfile/YAML dependency):
 * `pnpm lint` and `pnpm typecheck` never look at these files, so this is the
 * only place a missing `engines` can fail a gate. Run with `pnpm test:scripts`.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const PACKAGES_DIR = join(ROOT, 'packages')
const WORKFLOW_DIR = join(ROOT, '.github', 'workflows')

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

/** Workspace packages, paired with the manifest read from disk. */
const packages = readdirSync(PACKAGES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => ({
    dir: entry.name,
    file: join(PACKAGES_DIR, entry.name, 'package.json'),
  }))
  .filter((pkg) => existsSync(pkg.file))
  .map((pkg) => ({ ...pkg, manifest: readJson(pkg.file) }))

const { engines: rootEngines } = readJson(join(ROOT, 'package.json'))
const rootFloor = rootEngines?.node

/** Leading major of a range such as `>=20` — the part that decides installs. */
function majorOf(range) {
  const match = /(\d+)/.exec(range ?? '')
  assert.ok(match, `no version found in ${JSON.stringify(range)}`)
  return Number(match[1])
}

test('the root manifest declares the Node floor the packages inherit', () => {
  assert.equal(typeof rootFloor, 'string', 'root package.json has no engines.node')
})

test('every publishable package declares engines.node', () => {
  assert.ok(packages.length > 0, 'no packages found under packages/*')
  for (const { dir, manifest } of packages) {
    assert.equal(
      typeof manifest.engines?.node,
      'string',
      `packages/${dir} would publish without engines.node`,
    )
  }
})

test('packages and root agree on the Node floor', () => {
  for (const { dir, manifest } of packages) {
    assert.equal(
      manifest.engines.node,
      rootFloor,
      `packages/${dir} disagrees with the root Node floor (${rootFloor})`,
    )
  }
})

test('no package constrains the package manager of its consumers', () => {
  // A `pnpm` bound is meaningful for this repo, not for someone installing the
  // package with npm/yarn — shipping it only produces noise in their install.
  for (const { dir, manifest } of packages) {
    assert.equal(
      manifest.engines?.pnpm,
      undefined,
      `packages/${dir} ships an engines.pnpm bound to its npm consumers`,
    )
  }
})

/** `node-version:` / `node-version-file:` entries of the workflows that build and publish. */
function workflowNodeVersions() {
  return ['ci.yml', 'publish.yml'].map((name) => {
    const yaml = readFileSync(join(WORKFLOW_DIR, name), 'utf8')
    const versions = [...yaml.matchAll(/node-version:\s*(\S+)/g)].map(([, v]) => v)
    const files = [...yaml.matchAll(/node-version-file:\s*(\S+)/g)].map(([, v]) => v)

    for (const file of files) {
      const filePath = join(ROOT, file)
      assert.ok(existsSync(filePath), `${name} points at a missing ${file}`)
      const version = readFileSync(filePath, 'utf8').trim()
      assert.ok(version, `${file} is empty`)
      versions.push(version)
    }

    assert.ok(versions.length > 0, `${name} does not pin a Node version`)
    return { name, versions: versions.map(majorOf) }
  })
}

test('the declared floor is not above the Node CI actually builds with', () => {
  const floor = majorOf(rootFloor)
  for (const { name, versions } of workflowNodeVersions()) {
    for (const version of versions) {
      assert.ok(
        version >= floor,
        `${name} builds on Node ${version}, below the declared floor ${rootFloor}`,
      )
    }
  }
})
