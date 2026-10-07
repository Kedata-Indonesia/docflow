#!/usr/bin/env node
/**
 * Patch-bump the publishable packages affected by a push, so that
 * "push to main" can publish a fresh version without a manual bump.
 *
 * A package is affected when the changed range touched its files (ignoring
 * docs/tests/dist), or when it depends on an affected package — dependents must
 * be re-released because internal deps are published as exact versions
 * (`workspace:*` is resolved at publish time).
 *
 * Usage:
 *   node scripts/bump-release-versions.mjs <before|auto> <after> [--dry-run]
 *
 * `auto` anchors `<before>` to the newest `chore(release):` commit — the one
 * this pipeline itself pushes — falling back to `$BASE_FALLBACK` (the pushed
 * range) before the first automated release. Anchoring on the last release
 * commit keeps the range correct even when a queued run gets cancelled by a
 * newer push.
 *
 * Writes the new version into `packages/<name>/package.json` and reports the
 * affected packages on stdout (plus a `bumped=<csv>` line on `$GITHUB_OUTPUT`).
 * Exits 0 with an empty list when there is nothing to release.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Publish order is also dependency order (dependency-first). */
export const PUBLISH_ORDER = ['core', 'layout-engine', 'plugins', 'vue', 'element', 'export'];
const SOURCE_SCOPE = '@kedata-indonesia/docflow-';
const DEP_SECTIONS = ['dependencies', 'peerDependencies', 'optionalDependencies'];

const ROOT = process.env.REPO_ROOT
  ? path.resolve(process.env.REPO_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PKG_ROOT = path.join(ROOT, 'packages');

/** Subject of the release commit this pipeline pushes. Matched as an ERE. */
export const RELEASE_COMMIT_PATTERN = '^chore\\(release\\):';

/** Files that never require a release: docs, tests, build output. */
export function isIgnored(relPath) {
  if (/\.md$/i.test(relPath)) return true;
  if (/(^|\/)(__tests__|dist)\//.test(relPath)) return true;
  if (/\.(test|spec)\.(vue|[cm]?[jt]sx?)$/i.test(relPath)) return true;
  return false;
}

/** `packages/<name>/...` -> `<name>`, else null (root files never bump). */
export function packageOf(relPath) {
  const match = /^packages\/([^/]+)\//.exec(relPath);
  if (!match) return null;
  return PUBLISH_ORDER.includes(match[1]) ? match[1] : null;
}

function readPackage(name) {
  const file = path.join(PKG_ROOT, name, 'package.json');
  return JSON.parse(readFileSync(file, 'utf8'));
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
}

function gitRefExists(ref) {
  try {
    git(['cat-file', '-e', `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

function changedFiles(before, after) {
  // `--no-renames` lists both sides of a move, so a file leaving a package
  // still marks that package as changed.
  const output = git(['diff', '--name-only', '--no-renames', '--diff-filter=ACMRD', before, after]);
  return output.split('\n').filter(Boolean);
}

/**
 * Resolve `<before>`: `auto` -> newest release commit on HEAD, else the pushed
 * range from `$BASE_FALLBACK`.
 */
export function resolveBase(requested, fallback = process.env.BASE_FALLBACK ?? '') {
  if (requested !== 'auto') return requested;
  try {
    const found = git([
      'log',
      '-1',
      '--extended-regexp',
      '--format=%H',
      '--grep',
      RELEASE_COMMIT_PATTERN,
      'HEAD',
    ]).trim();
    if (found) return found;
  } catch {
    // No history to search (e.g. shallow clone) — use the pushed range below.
  }
  return fallback;
}

/** Direct dependents of `name` inside this workspace. */
export function dependentsOf(name, packages) {
  const specifier = `${SOURCE_SCOPE}${name}`;
  return PUBLISH_ORDER.filter((other) => {
    if (other === name) return false;
    return DEP_SECTIONS.some((section) => (packages[other][section] ?? {})[specifier] !== undefined);
  });
}

export function withDependents(changed, packages) {
  const affected = new Set(changed);
  let grew = true;
  while (grew) {
    grew = false;
    for (const name of [...affected]) {
      for (const dependent of dependentsOf(name, packages)) {
        if (!affected.has(dependent)) {
          affected.add(dependent);
          grew = true;
        }
      }
    }
  }
  return PUBLISH_ORDER.filter((name) => affected.has(name));
}

export function bumpPatch(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].+)?$/.exec(version);
  if (!match) throw new Error(`unsupported version "${version}"`);
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

function release(requestedBefore, after, dryRun) {
  const before = resolveBase(requestedBefore);
  if (!before || /^0+$/.test(before) || !gitRefExists(before) || !gitRefExists(after)) {
    console.log(`No usable commit range (${before || '<none>'}..${after}); nothing to release.`);
    return [];
  }
  console.log(`Release range: ${before}..${after}`);

  const packages = Object.fromEntries(PUBLISH_ORDER.map((name) => [name, readPackage(name)]));
  const changed = new Set();
  for (const file of changedFiles(before, after)) {
    const name = packageOf(file);
    if (name && !isIgnored(file)) changed.add(name);
  }

  const affected = withDependents(changed, packages);
  const released = [];

  for (const name of affected) {
    const file = path.join(PKG_ROOT, name, 'package.json');
    const current = packages[name];
    const next = bumpPatch(current.version);
    const reason = changed.has(name) ? 'changed' : 'dependency of changed package';
    console.log(`${name}: ${current.version} -> ${next} (${reason})`);
    if (!dryRun) {
      writeFileSync(file, `${JSON.stringify({ ...current, version: next }, null, 2)}\n`);
    }
    released.push(name);
  }

  if (released.length === 0) console.log('No changed publishable package; nothing to release.');
  return released;
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const [before, after] = args.filter((arg) => !arg.startsWith('--'));

  if (!before || !after) {
    console.error('usage: bump-release-versions.mjs <before|auto> <after> [--dry-run]');
    process.exit(1);
  }

  const released = release(before, after, dryRun);
  const csv = released.join(',');
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `bumped=${csv}\n`);
  console.log(`bumped=${csv}${dryRun ? ' (dry-run)' : ''}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
