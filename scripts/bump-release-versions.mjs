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
 * Versions are registry-aware: an affected package gets the first patch version
 * that is still free on npm (`npm view @kedataindo/docflow-<name> versions`), so
 * a repo that drifted behind the registry self-heals instead of re-bumping into
 * a version that already exists — which the publish step would silently skip,
 * leaving a green run that ships nothing. An unreachable registry is a hard
 * error, never "assume free", for the same reason.
 *
 * The version arithmetic and the registry reads live in
 * `scripts/lib/release-versions.mjs`. That module also reads the test-only
 * `$NPM_PUBLISHED_STUB` (JSON map of `<name>` -> version(s), with `"ERROR"`
 * simulating an outage) so tests never touch the network — and refuses it
 * outside `node --test`.
 *
 * Writes the new version into `packages/<name>/package.json` and reports the
 * affected packages on stdout (plus a `bumped=<csv>` line on `$GITHUB_OUTPUT`).
 * Exits 0 with an empty list when there is nothing to release.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { highestVersion, nextFreeVersion, publishedVersions } from './lib/release-versions.mjs';

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
 *
 * `--no-merges` is load-bearing: the pipeline lands each release commit by
 * opening and merging a PR, so the resulting merge commit's message *quotes*
 * the release subject (`chore(release): bump … [skip ci]`) in its body. A plain
 * `--grep` would match that merge commit — which is newer — and move the anchor
 * past any change merged while the run was in flight, silently marking it
 * released without ever publishing it. Only the pipeline's own non-merge commit
 * is a valid anchor.
 */
export function resolveBase(requested, fallback = process.env.BASE_FALLBACK ?? '') {
  if (requested !== 'auto') return requested;
  try {
    const found = git([
      'log',
      '-1',
      '--no-merges',
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

function release(requestedBefore, after, dryRun) {
  const before = resolveBase(requestedBefore);
  if (!before || /^0+$/.test(before) || !gitRefExists(before) || !gitRefExists(after)) {
    // A push whose range cannot be resolved (first push of a branch, history
    // rewrite) must fail: exiting "successfully" without releasing is the exact
    // failure mode this pipeline is meant to rule out.
    throw new Error(
      `no usable commit range (${before || '<none>'}..${after}): cannot tell what changed`,
    );
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
    const published = publishedVersions(name);
    const latest = highestVersion(published);
    const next = nextFreeVersion(current.version, published);
    const reason = changed.has(name) ? 'changed' : 'dependency of changed package';
    const note = latest === null ? '' : `; npm has ${latest}`;
    console.log(`${name}: ${current.version} -> ${next} (${reason}${note})`);
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

  let released;
  try {
    released = release(before, after, dryRun);
  } catch (error) {
    // Never bump on a guess: a version that is already taken would be skipped
    // by the publish step, so the run would go green without releasing.
    console.error(`release bump failed: ${error.message}`);
    process.exit(1);
  }

  const csv = released.join(',');
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `bumped=${csv}\n`);
  console.log(`bumped=${csv}${dryRun ? ' (dry-run)' : ''}`);
}

/**
 * True when this file was invoked directly. Both sides are resolved through
 * symlinks: a bin shim that hides the real path would otherwise exit 0 without
 * releasing anything — the failure mode this pipeline exists to rule out.
 */
function isDirectRun() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  main();
}
