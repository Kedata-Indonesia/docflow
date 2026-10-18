#!/usr/bin/env node
/**
 * Guards the published bundles against re-bundling their runtime dependencies
 * (issue #168).
 *
 * `@kedataindo/docflow-vue` once shipped TipTap/ProseMirror, lucide and the CSL
 * styles inlined (2.17 MB `dist`), which killed consumer tree-shaking and could
 * load a second ProseMirror instance. The fix is the `external` list in each
 * package's `vite.config.ts`; this test fails when a declared runtime dependency
 * is not externalised again.
 *
 * Run with: pnpm test:scripts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Packages that have a Vite library build. */
const VITE_PACKAGES = ['vue', 'element'];

/** Sections whose entries are resolved at runtime by the consumer. */
const RUNTIME_SECTIONS = ['dependencies', 'peerDependencies'];

function readText(...segments) {
  return readFileSync(path.join(ROOT, ...segments), 'utf8');
}

function readManifest(name) {
  return JSON.parse(readText('packages', name, 'package.json'));
}

/** The literals inside the `external` array of a Vite config. */
function externalEntries(name) {
  const config = readText('packages', name, 'vite.config.ts');
  const array = /(?:const\s+external\s*=|external:)\s*\[([\s\S]*?)\]/.exec(config);
  assert.ok(array, `packages/${name}/vite.config.ts has no external array`);
  return [...array[1].matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

test('every runtime dependency stays external in the Vite build', () => {
  for (const name of VITE_PACKAGES) {
    const manifest = readManifest(name);
    const external = new Set(externalEntries(name));

    for (const section of RUNTIME_SECTIONS) {
      for (const dependency of Object.keys(manifest[section] ?? {})) {
        assert.ok(
          external.has(dependency),
          `packages/${name}: "${dependency}" from ${section} is not in the external list, so it would be bundled into dist`,
        );
      }
    }
  }
});

test('vue does not depend on TipTap extensions at runtime', () => {
  const manifest = readManifest('vue');
  const runtime = Object.keys(manifest.dependencies ?? {});
  assert.deepEqual(
    runtime.filter((name) => name.startsWith('@tiptap/')),
    [],
    'TipTap packages belong to docflow-core/plugins; vue only uses their types',
  );
});

test('prosemirror-model is a peer of vue, so the page keeps one instance', () => {
  const manifest = readManifest('vue');
  assert.equal(
    manifest.dependencies?.['prosemirror-model'],
    undefined,
    'a regular dependency can resolve to a second copy next to the host app',
  );
  assert.ok(
    manifest.peerDependencies?.['prosemirror-model'],
    'prosemirror-model must be declared as a peer dependency',
  );
  assert.ok(
    manifest.devDependencies?.['prosemirror-model'],
    'the peer needs a devDependency entry so local builds resolve it',
  );
});
