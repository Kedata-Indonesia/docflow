#!/usr/bin/env node
/**
 * Unit tests for the release bump helper (`node --test`).
 * Run with: pnpm test:scripts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PUBLISH_ORDER,
  dependentsOf,
  isIgnored,
  packageOf,
  resolveBase,
  withDependents,
} from '../bump-release-versions.mjs';
import { bumpPatch } from '../lib/release-versions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = path.join(ROOT, 'scripts', 'bump-release-versions.mjs');

/** Real workspace metadata, so the dependency graph is asserted, not faked. */
const packages = Object.fromEntries(
  PUBLISH_ORDER.map((name) => [
    name,
    JSON.parse(readFileSync(path.join(ROOT, 'packages', name, 'package.json'), 'utf8')),
  ]),
);

test('isIgnored skips docs, tests and build output', () => {
  for (const ignored of [
    'packages/core/README.md',
    'packages/vue/src/__tests__/PageView.test.ts',
    'packages/vue/src/PageView.test.vue',
    'packages/core/src/foo.spec.vue',
    'packages/core/dist/index.js',
    'packages/core/src/foo.spec.ts',
  ]) {
    assert.equal(isIgnored(ignored), true, ignored);
  }

  for (const kept of ['packages/core/src/index.ts', 'packages/vue/package.json']) {
    assert.equal(isIgnored(kept), false, kept);
  }
});

test('packageOf maps only publishable package files', () => {
  assert.equal(packageOf('packages/core/src/index.ts'), 'core');
  assert.equal(packageOf('packages/layout-engine/src/a/b.ts'), 'layout-engine');
  assert.equal(packageOf('packages/playground/src/main.ts'), null);
  assert.equal(packageOf('scripts/bump-release-versions.mjs'), null);
  assert.equal(packageOf('README.md'), null);
});

test('bumpPatch increments only the patch digit', () => {
  assert.equal(bumpPatch('0.0.9'), '0.0.10');
  assert.equal(bumpPatch('1.2.3'), '1.2.4');
  assert.equal(bumpPatch('0.0.1-beta.0'), '0.0.2');
  assert.equal(bumpPatch('1.2.3+build.7'), '1.2.4');
  assert.throws(() => bumpPatch('v1'), /unsupported version/);
});

test('resolveBase passes explicit refs through and falls back for auto', () => {
  assert.equal(resolveBase('abc123', 'fallback'), 'abc123');

  // `auto` = newest release commit on HEAD (ignoring merge commits, whose
  // messages quote the release subject), else the fallback. Assert against git
  // directly so the test is precise whether or not a release commit exists.
  const releaseSha = execFileSync(
    'git',
    [
      'log',
      '-1',
      '--no-merges',
      '--extended-regexp',
      '--format=%H',
      '--grep',
      '^chore\\(release\\):',
      'HEAD',
    ],
    { cwd: ROOT, encoding: 'utf8' },
  ).trim();
  assert.equal(resolveBase('auto', 'fallback'), releaseSha || 'fallback');
});

test('dependentsOf reads the real workspace graph', () => {
  assert.deepEqual(dependentsOf('core', packages).sort(), ['element', 'layout-engine', 'plugins', 'vue']);
  assert.deepEqual(dependentsOf('vue', packages), ['element']);
  assert.deepEqual(dependentsOf('export', packages), []);
});

test('withDependents expands transitively, in publish order', () => {
  assert.deepEqual(withDependents(['export'], packages), ['export']);
  assert.deepEqual(withDependents(['vue'], packages), ['vue', 'element']);
  assert.deepEqual(withDependents(['core'], packages), [
    'core',
    'layout-engine',
    'plugins',
    'vue',
    'element',
  ]);
  assert.deepEqual(withDependents([], packages), []);
});

test('auto anchors the range on the newest release commit', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'docflow-release-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 'release-test@example.com');
  git('config', 'user.name', 'Release Test');

  /** Mirrors the real workspace graph so dependents are bumped. */
  const internalDeps = {
    'layout-engine': ['core'],
    plugins: ['core'],
    vue: ['core', 'layout-engine', 'plugins'],
    element: ['core', 'vue'],
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

  const coreDir = path.join(dir, 'packages', 'core');
  writeFileSync(path.join(coreDir, 'src', 'index.ts'), 'export {};\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'feat: initial');

  // The release commit this pipeline pushes after publishing.
  const bumped = { name: '@kedata-indonesia/docflow-core', version: '0.0.2' };
  writeFileSync(path.join(coreDir, 'package.json'), `${JSON.stringify(bumped, null, 2)}\n`);
  git('add', '-A');
  git('commit', '-q', '-m', 'chore(release): bump core [skip ci]');
  const releaseSha = git('rev-parse', 'HEAD').trim();

  // A later change — the one this run must release.
  writeFileSync(path.join(coreDir, 'src', 'index.ts'), 'export const x = 1;\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'fix: change core');

  const out = execFileSync(process.execPath, [SCRIPT, 'auto', 'HEAD', '--dry-run'], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      ...process.env,
      REPO_ROOT: dir,
      BASE_FALLBACK: 'unused-fallback',
      // Nothing published yet: keeps the bump repo-relative and offline.
      NPM_PUBLISHED_STUB: '{}',
      // Never append to a real GITHUB_OUTPUT from a test child.
      GITHUB_OUTPUT: '',
    },
  });

  // Anchored on the release commit, so the already-released commit is not re-diffed.
  assert.match(out, new RegExp(`Release range: ${releaseSha}\\.\\.HEAD`));
  assert.match(out, /core: 0\.0\.2 -> 0\.0\.3 \(changed\)/);
  assert.match(out, /vue: 0\.0\.1 -> 0\.0\.2 \(dependency of changed package\)/);
  assert.match(out, /bumped=core,layout-engine,plugins,vue,element \(dry-run\)/);
});

test('auto ignores a merge commit that quotes the release subject (bookmark race)', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'docflow-release-merge-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 'release-test@example.com');
  git('config', 'user.name', 'Release Test');

  // All publishable packages exist so the script can read every package.json.
  for (const name of PUBLISH_ORDER) {
    const pkgDir = path.join(dir, 'packages', name);
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      path.join(pkgDir, 'package.json'),
      `${JSON.stringify({ name: `@kedata-indonesia/docflow-${name}`, version: '0.0.1' }, null, 2)}\n`,
    );
  }
  const coreDir = path.join(dir, 'packages', 'core');
  mkdirSync(path.join(coreDir, 'src'), { recursive: true });
  writeFileSync(path.join(coreDir, 'src', 'index.ts'), 'export {};\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'feat: initial');

  // The pipeline's own release commit — the only valid anchor.
  writeFileSync(
    path.join(coreDir, 'package.json'),
    `${JSON.stringify({ name: '@kedata-indonesia/docflow-core', version: '0.0.2' }, null, 2)}\n`,
  );
  git('add', '-A');
  git('commit', '-q', '-m', 'chore(release): bump core [skip ci]');
  const releaseSha = git('rev-parse', 'HEAD').trim();

  // A change merged while a run was in flight. GitHub's merge commit quotes the
  // PR title in its body, so the merge of a release PR carries the release
  // subject — the trap the plain `--grep` fell into (it moved the anchor past
  // the change, silently marking it released without publishing it).
  writeFileSync(path.join(coreDir, 'src', 'index.ts'), 'export const x = 1;\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'fix: change core after the release commit');
  const changeSha = git('rev-parse', 'HEAD').trim();
  const tree = git('rev-parse', 'HEAD^{tree}').trim();
  const mergeSha = git(
    'commit-tree',
    tree,
    '-p',
    changeSha,
    '-p',
    releaseSha,
    '-m',
    'Merge pull request #99 from Kedata-Indonesia/release/bump-1-1',
    '-m',
    'chore(release): bump core [skip ci]',
  ).trim();
  git('update-ref', 'HEAD', mergeSha);

  // Sanity: the naive grep really does hit the newer merge commit.
  const naive = git(
    'log',
    '-1',
    '--extended-regexp',
    '--format=%H',
    '--grep',
    '^chore\\(release\\):',
    'HEAD',
  ).trim();
  assert.equal(naive, mergeSha, 'the setup must reproduce the trap the fix guards');

  const out = execFileSync(process.execPath, [SCRIPT, 'auto', 'HEAD', '--dry-run'], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      ...process.env,
      REPO_ROOT: dir,
      BASE_FALLBACK: 'unused-fallback',
      NPM_PUBLISHED_STUB: '{}',
      GITHUB_OUTPUT: '',
    },
  });

  // The anchor stays on the real release commit, so the change merged after it
  // is still seen as unreleased and gets published.
  assert.match(out, new RegExp(`Release range: ${releaseSha}\\.\\.HEAD`));
  assert.match(out, /core: 0\.0\.2 -> 0\.0\.3 \(changed\)/);
});
