#!/usr/bin/env node
/**
 * Registry-aware release bump tests (`node --test`).
 * Run with: pnpm test:scripts
 *
 * Registry answers are stubbed through `$NPM_PUBLISHED_STUB` (with `"ERROR"`
 * simulating an outage) and through a fake `npm` on `$PATH`, so nothing here
 * ever talks to the real npm.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PUBLISH_ORDER } from '../bump-release-versions.mjs';
import {
  compareVersions,
  highestVersion,
  nextFreeVersion,
  publishedVersions,
} from '../lib/release-versions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = path.join(ROOT, 'scripts', 'bump-release-versions.mjs');

/** In-process tests answer through the injected lookup, never the ambient env. */
delete process.env.NPM_PUBLISHED_STUB;

test('nextFreeVersion bumps plainly while the package is unpublished', () => {
  assert.equal(nextFreeVersion('0.0.60', []), '0.0.61');
  assert.equal(nextFreeVersion('0.0.1', []), '0.0.2');
});

test('nextFreeVersion skips past a registry that is ahead of the repo', () => {
  assert.equal(nextFreeVersion('0.0.60', ['0.0.61', '0.0.83']), '0.0.84');
  assert.equal(nextFreeVersion('0.0.63', ['0.0.86']), '0.0.87');
});

test('nextFreeVersion lands above every published version', () => {
  // Unsorted input with gaps: the highest wins, not the list order.
  assert.equal(nextFreeVersion('0.0.10', ['0.0.11', '0.0.14', '0.0.12']), '0.0.15');
  // A prerelease of the candidate does not block the plain version.
  assert.equal(nextFreeVersion('0.0.10', ['0.0.11-beta.0']), '0.0.11');
  // An exact hit on the candidate always moves on.
  assert.equal(nextFreeVersion('0.0.10', ['0.0.11']), '0.0.12');
  // Build metadata is the same release for npm, so it must not be re-published.
  assert.equal(nextFreeVersion('0.0.1', ['0.0.2+build.7']), '0.0.3');
});

test('compareVersions and highestVersion compare numeric triples', () => {
  assert.equal(compareVersions('0.0.9', '0.0.10'), -1);
  assert.equal(compareVersions('0.1.0', '0.0.99'), 1);
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0);
  assert.equal(compareVersions('1.2.3-beta.1', '1.2.3'), 0);
  assert.equal(highestVersion([]), null);
  assert.equal(highestVersion(['0.0.2', '0.0.10']), '0.0.10');
});

test('publishedVersions normalises a single version, a list and a 404', () => {
  assert.deepEqual(publishedVersions('core', () => '0.0.60'), ['0.0.60']);
  assert.deepEqual(publishedVersions('core', () => ['0.0.60', '0.0.61']), ['0.0.60', '0.0.61']);
  assert.deepEqual(publishedVersions('export', () => []), []);
});

test('publishedVersions fails loudly when the registry is unreachable', () => {
  const unreachable = () => {
    throw new Error('getaddrinfo ENOTFOUND registry.npmjs.org');
  };
  assert.throws(() => publishedVersions('core', unreachable), /ENOTFOUND/);
});

/**
 * Runs `fn` with a fake `npm` first on `$PATH` and restores it afterwards, so
 * the real lookup path (`execFileSync` + JSON parsing + 404 handling) is
 * exercised without touching the network.
 */
function withFakeNpm(script, fn) {
  const dir = mkdtempSync(path.join(tmpdir(), 'docflow-fake-npm-'));
  writeFileSync(path.join(dir, 'npm'), `#!/bin/sh\n${script}\n`, { mode: 0o755 });
  const previous = process.env.PATH;
  process.env.PATH = `${dir}${path.delimiter}${previous ?? ''}`;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.PATH;
    else process.env.PATH = previous;
    rmSync(dir, { recursive: true, force: true });
  }
}

test('the real lookup path reads npm, tolerates 404 and fails on an outage', () => {
  assert.deepEqual(
    withFakeNpm(`printf '["0.0.60","0.0.61"]'`, () => publishedVersions('core')),
    ['0.0.60', '0.0.61'],
  );

  // Exit 1 + npm's own E404 code is "npm never saw this package", not a failure.
  const notFound = [
    'echo "npm error code E404" >&2',
    'echo "npm error 404 Not Found - GET https://registry.npmjs.org" >&2',
    'exit 1',
  ].join('; ');
  assert.deepEqual(withFakeNpm(notFound, () => publishedVersions('export')), []);

  // Any other failure must never be mistaken for "the version is free" — not
  // even one that merely mentions a 404.
  const outage = 'echo "npm error network getaddrinfo ENOTFOUND" >&2; exit 1';
  const cached404 = 'echo "proxy: 404 Not Found from cache" >&2; exit 1';
  for (const script of [outage, cached404]) {
    assert.throws(
      () => withFakeNpm(script, () => publishedVersions('core')),
      /cannot read @kedataindo\/docflow-core from https:\/\/registry\.npmjs\.org/,
      script,
    );
  }
});

test('a symlinked entry point still runs the bump', (t) => {
  const dir = makeRepo(t);
  const linkDir = mkdtempSync(path.join(tmpdir(), 'docflow-link-'));
  t.after(() => rmSync(linkDir, { recursive: true, force: true }));
  const link = path.join(linkDir, 'bump-release-versions.mjs');
  symlinkSync(SCRIPT, link);

  // With no arguments, "the entry point ran" means the usage error and exit 1.
  // An entry-point guard that missed the symlink would exit 0 silently.
  assert.throws(
    () =>
      execFileSync(process.execPath, [link], {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, REPO_ROOT: dir, NPM_PUBLISHED_STUB: '{}', GITHUB_OUTPUT: '' },
      }),
    (error) => {
      assert.equal(error.status, 1);
      assert.match(String(error.stderr), /usage: bump-release-versions\.mjs/);
      return true;
    },
  );
});

/** Minimal repo with the real publish order and dependency shape. */
function makeRepo(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'docflow-registry-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 'release-test@example.com');
  git('config', 'user.name', 'Release Test');

  const internalDeps = {
    'layout-engine': ['core'],
    plugins: ['core'],
    vue: ['core'],
    element: ['vue'],
  };

  for (const name of PUBLISH_ORDER) {
    const pkgDir = path.join(dir, 'packages', name);
    mkdirSync(path.join(pkgDir, 'src'), { recursive: true });
    const dependencies = Object.fromEntries(
      (internalDeps[name] ?? []).map((dep) => [`@kedata-indonesia/docflow-${dep}`, 'workspace:*']),
    );
    const pkg = { name: `@kedata-indonesia/docflow-${name}`, version: '0.0.1' };
    if (Object.keys(dependencies).length > 0) pkg.dependencies = dependencies;
    writeFileSync(path.join(pkgDir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
  }

  writeFileSync(path.join(dir, 'packages', 'core', 'src', 'index.ts'), 'export {};\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'feat: initial');

  // The change this run must release: `core` (and its dependents) plus the
  // never-published `export`.
  writeFileSync(path.join(dir, 'packages', 'core', 'src', 'index.ts'), 'export const x = 1;\n');
  writeFileSync(path.join(dir, 'packages', 'export', 'src', 'index.ts'), 'export const y = 1;\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'fix: change core and export');

  return dir;
}

function runBump(dir, { stub = '{}', args = ['HEAD~1', 'HEAD'], env = {} } = {}) {
  return execFileSync(process.execPath, [SCRIPT, ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      ...process.env,
      REPO_ROOT: dir,
      NPM_PUBLISHED_STUB: stub,
      // Never append to a real GITHUB_OUTPUT from a test child.
      GITHUB_OUTPUT: '',
      ...env,
    },
  });
}

/** Assert that a bump run fails loudly and reports `<message>`. */
function assertBumpFails(dir, options, message) {
  assert.throws(
    () => runBump(dir, options),
    (error) => {
      assert.notEqual(error.status, 0);
      assert.match(String(error.stderr), message);
      return true;
    },
  );
}

test('the bump self-heals a repo that drifted behind npm', (t) => {
  const dir = makeRepo(t);
  const out = runBump(dir, { stub: JSON.stringify({ core: ['0.0.1', '0.0.60'], vue: ['0.0.63'] }) });

  assert.match(out, /core: 0\.0\.1 -> 0\.0\.61 \(changed; npm has 0\.0\.60\)/);
  assert.match(out, /vue: 0\.0\.1 -> 0\.0\.64 \(dependency of changed package; npm has 0\.0\.63\)/);
  // Never published: no registry note, and the plain bump wins.
  assert.match(out, /export: 0\.0\.1 -> 0\.0\.2 \(changed\)\n/);
  assert.match(out, /bumped=core,layout-engine,plugins,vue,element,export/);

  const versionOf = (name) =>
    JSON.parse(readFileSync(path.join(dir, 'packages', name, 'package.json'), 'utf8')).version;
  assert.equal(versionOf('core'), '0.0.61');
  assert.equal(versionOf('vue'), '0.0.64');
  assert.equal(versionOf('element'), '0.0.2');
  assert.equal(versionOf('export'), '0.0.2');
});

test('an unreachable registry fails the bump instead of guessing', (t) => {
  const dir = makeRepo(t);
  assertBumpFails(
    dir,
    { stub: JSON.stringify({ core: 'ERROR' }) },
    /release bump failed: stub registry outage for core/,
  );
});

test('the test-only registry stub is refused outside `node --test`', (t) => {
  const dir = makeRepo(t);
  assertBumpFails(dir, { env: { NODE_TEST_CONTEXT: '' } }, /test-only and must not be set/);
});

test('an unresolvable base fails the bump instead of reporting success', (t) => {
  const dir = makeRepo(t);
  const zeros = '0'.repeat(40);
  // `auto` with no release commit and an all-zero $BASE_FALLBACK: the first
  // push of a branch, where nothing can be diffed.
  assertBumpFails(
    dir,
    { args: ['auto', 'HEAD'], env: { BASE_FALLBACK: zeros } },
    /no usable commit range \(0{40}\.\.HEAD\)/,
  );
});
