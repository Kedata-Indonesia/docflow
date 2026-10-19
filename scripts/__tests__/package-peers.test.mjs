#!/usr/bin/env node
/**
 * Guards the published manifests against the #229 failure mode: a package
 * declared as an *optional* peer must not be imported statically by the
 * library source.
 *
 * Vite/Rollup replace a missing optional peer with an empty
 * `__vite-optional-peer-dep:` stub, so a static named import fails the host
 * build with `"X" is not exported by …` even though the peer is "optional" —
 * and `pnpm peers check` stays clean because the peer *is* declared. Optional
 * has to mean lazy: use `await import(...)` in the code path that needs it, or
 * ship it as a regular dependency.
 *
 * Run with: pnpm test:scripts
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const PACKAGES_DIR = join(ROOT, 'packages')

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

const packages = readdirSync(PACKAGES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => ({
    dir: entry.name,
    file: join(PACKAGES_DIR, entry.name, 'package.json'),
  }))
  .filter((pkg) => existsSync(pkg.file))
  .map((pkg) => ({ ...pkg, manifest: readJson(pkg.file) }))

/** Every non-test TypeScript source file below a package's `src/`. */
function sourceFiles(dir) {
  if (!existsSync(dir)) return []
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'node_modules' || entry.name === 'dist') {
      continue
    }
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...sourceFiles(full))
    } else if (/\.(?:ts|tsx|mts|cts)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) {
      files.push(full)
    }
  }
  return files
}

/**
 * Bare package specifiers of static `import`/`export … from` statements.
 * Type-only statements are erased at build time and dynamic `import()`
 * expressions load lazily, so neither can trigger the optional-peer stub.
 */
function staticImports(file) {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  )
  const specifiers = []
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) {
      if (statement.importClause?.isTypeOnly) continue
    } else if (ts.isExportDeclaration(statement)) {
      if (statement.isTypeOnly) continue
    } else {
      continue
    }
    const specifier = statement.moduleSpecifier
    if (specifier && ts.isStringLiteral(specifier)) specifiers.push(specifier.text)
  }
  return specifiers
}

/** `@scope/name` from `@scope/name/subpath`, or the leading segment otherwise. */
function packageName(specifier) {
  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:')) {
    return null
  }
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

test('no package statically imports an optional peer (#229)', () => {
  for (const { dir, manifest } of packages) {
    const optionalPeers = new Set(
      Object.entries(manifest.peerDependenciesMeta ?? {})
        .filter(([, meta]) => meta?.optional === true)
        .map(([name]) => name),
    )
    if (optionalPeers.size === 0) continue

    for (const file of sourceFiles(join(PACKAGES_DIR, dir, 'src'))) {
      const where = `packages/${dir}/${relative(join(PACKAGES_DIR, dir), file)}`
      for (const specifier of staticImports(file)) {
        const name = packageName(specifier)
        assert.ok(
          !name || !optionalPeers.has(name),
          `${where} statically imports optional peer "${name}" — make it a regular dependency or use a dynamic import`,
        )
      }
    }
  }
})

test('every statically imported package is declared by its manifest', () => {
  for (const { dir, manifest } of packages) {
    const declared = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
    ])

    for (const file of sourceFiles(join(PACKAGES_DIR, dir, 'src'))) {
      const where = `packages/${dir}/${relative(join(PACKAGES_DIR, dir), file)}`
      for (const specifier of staticImports(file)) {
        const name = packageName(specifier)
        if (!name) continue
        assert.ok(
          declared.has(name),
          `${where} statically imports "${name}", which packages/${dir}/package.json does not declare`,
        )
      }
    }
  }
})
