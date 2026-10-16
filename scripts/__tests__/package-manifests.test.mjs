#!/usr/bin/env node
/**
 * Guards the published-package metadata that `engines` once silently missed.
 *
 * `engines` is not inherited from the workspace root: unless each
 * `packages/<name>/package.json` repeats it, consumers on an older Node get no
 * EBADENGINE warning and instead hit confusing syntax/runtime errors. The floor
 * here must stay identical to the root manifest and to the Node that CI
 * (ci.yml / publish.yml) provisions.
 *
 * Run with: pnpm test:scripts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PUBLISH_ORDER } from '../bump-release-versions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** The Node floor CI provisions (Node 22) and consumers must meet. */
const NODE_RANGE = '>=20';

function readManifest(...segments) {
  const file = path.join(ROOT, ...segments);
  return JSON.parse(readFileSync(file, 'utf8'));
}

const root = readManifest('package.json');

test('root declares the Node floor that CI provisions', () => {
  assert.equal(root.engines?.node, NODE_RANGE, 'root engines.node');
});

test('every publishable package declares the same Node floor as root', () => {
  for (const name of PUBLISH_ORDER) {
    const manifest = readManifest('packages', name, 'package.json');
    assert.equal(
      manifest.engines?.node,
      root.engines?.node,
      `packages/${name} must pin engines.node to the root value`,
    );
  }
});

test('publishable packages leave the consumer package manager unconstrained', () => {
  for (const name of PUBLISH_ORDER) {
    const manifest = readManifest('packages', name, 'package.json');
    assert.equal(
      manifest.engines?.pnpm,
      undefined,
      `packages/${name} must not force pnpm on npm consumers`,
    );
  }
});

test('publishable packages ship only dist', () => {
  for (const name of PUBLISH_ORDER) {
    const manifest = readManifest('packages', name, 'package.json');
    assert.deepEqual(manifest.files, ['dist'], `packages/${name} files`);
  }
});
