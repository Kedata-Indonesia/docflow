/**
 * Version arithmetic and public-registry lookups for the release bump
 * (`scripts/bump-release-versions.mjs`).
 *
 * Everything here serves one guarantee: the version a release picks is never one
 * npm already has. That is what stops the idempotent publish step from skipping
 * every package and turning a broken release into a green run that ships nothing.
 *
 * `$NPM_PUBLISHED_STUB` (a JSON map of `<name>` -> version(s), with `"ERROR"`
 * simulating an outage) answers the lookups without touching the network, and is
 * accepted only inside `node --test`.
 */
import { execFileSync } from 'node:child_process';

/** Registry the publish step pushes to. */
const REGISTRY = 'https://registry.npmjs.org';
/** Name a workspace package is published under. */
const PUBLISH_SCOPE = '@kedataindo/docflow-';

export function bumpPatch(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].+)?$/.exec(version);
  if (!match) throw new Error(`unsupported version "${version}"`);
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

/** Numeric triple of `x.y.z`, ignoring any prerelease/build suffix. */
function numericTriple(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) throw new Error(`unsupported version "${version}"`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Highest version of a list, or null when the list is empty. */
export function highestVersion(versions) {
  return versions.reduce(
    (highest, version) =>
      highest === null || compareVersions(version, highest) > 0 ? version : highest,
    null,
  );
}

/** Compare two versions as numeric triples; returns -1, 0 or 1. */
export function compareVersions(left, right) {
  const a = numericTriple(left);
  const b = numericTriple(right);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

/**
 * True when npm would treat `<candidate>` as already released: an exact
 * duplicate, or the same triple carrying build metadata (`0.0.2+build.7`).
 * A prerelease of the triple does not block the plain version, because semver
 * orders `0.0.11-beta.0` below `0.0.11`.
 */
function isTaken(published, candidate) {
  const triple = numericTriple(candidate).join('.');
  return published.some(
    (version) => !version.includes('-') && numericTriple(version).join('.') === triple,
  );
}

/**
 * First patch version strictly above `<current>` and above everything already
 * published. Guarantees the publish step has something to do.
 */
export function nextFreeVersion(current, published) {
  const highest = highestVersion(published);
  let candidate = bumpPatch(current);
  // Only jump when the candidate is *behind* the registry: a prerelease of the
  // same triple (0.0.11-beta.0) does not block the plain 0.0.11.
  if (highest !== null && compareVersions(candidate, highest) < 0) candidate = bumpPatch(highest);
  while (isTaken(published, candidate)) candidate = bumpPatch(candidate);
  return candidate;
}

function asVersionList(value) {
  if (value === null || value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).map(String);
}

/** Reads every published version of `<name>`; `[]` when npm never saw it. */
function npmView(name) {
  try {
    const stdout = execFileSync(
      'npm',
      ['view', `${PUBLISH_SCOPE}${name}`, 'versions', '--json', `--registry=${REGISTRY}`],
      // A stalled registry must fail the release step, not hang it.
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 },
    );
    return stdout.trim() ? JSON.parse(stdout) : [];
  } catch (error) {
    const stderr = String(error.stderr ?? '');
    // Only npm's own E404 code means "this package does not exist". A transient
    // failure that merely mentions a 404 must stay an error: treating it as
    // "free" would re-open the silent skip this module exists to close.
    if (/\bE404\b/.test(stderr)) return [];
    throw new Error(
      `cannot read ${PUBLISH_SCOPE}${name} from ${REGISTRY}: ${stderr.trim() || error.message}`,
    );
  }
}

/**
 * Versions of `<name>` already on the registry. An injected `lookup` wins (unit
 * tests); otherwise `$NPM_PUBLISHED_STUB` answers without network access.
 */
export function publishedVersions(name, lookup) {
  if (lookup) return asVersionList(lookup(name));
  const stub = process.env.NPM_PUBLISHED_STUB;
  if (stub) {
    // Outside `node --test` the stub is always a mistake, and a dangerous one:
    // it would report every package as unpublished and re-create the silent
    // no-op release this script exists to prevent.
    if (!process.env.NODE_TEST_CONTEXT) {
      throw new Error('NPM_PUBLISHED_STUB is test-only and must not be set outside `node --test`');
    }
    const entry = JSON.parse(stub)[name];
    if (entry === 'ERROR') throw new Error(`stub registry outage for ${name}`);
    return asVersionList(entry);
  }
  return asVersionList(npmView(name));
}
