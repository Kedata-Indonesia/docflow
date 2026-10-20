#!/usr/bin/env node
/**
 * #175 splits the 1000-line EditorToolbar monolith into a thin orchestrator and
 * focused toolbar modules. This guard keeps the split from regressing into one
 * giant file again.
 *
 * Run with: pnpm test:scripts
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const LIMIT = 300
const TOOLBAR_DIR = 'packages/vue/src/components/toolbar'

function lineCount(relativePath) {
  const content = readFileSync(join(ROOT, relativePath), 'utf8')
  return content.endsWith('\n') ? content.split('\n').length - 1 : content.split('\n').length
}

function toolbarFiles() {
  const files = readdirSync(join(ROOT, TOOLBAR_DIR))
    .filter((name) => name.endsWith('.vue') || name.endsWith('.ts'))
    .map((name) => `${TOOLBAR_DIR}/${name}`)

  return [
    'packages/vue/src/components/EditorToolbar.vue',
    ...files,
    'packages/vue/src/composables/useToolbarSelection.ts',
    'packages/vue/src/composables/useToolbarDropdowns.ts',
    'packages/vue/src/composables/useToolbarItems.ts',
    'packages/vue/src/composables/useFontSize.ts',
  ]
}

test('EditorToolbar and its toolbar modules stay under 300 lines (#175)', () => {
  const files = toolbarFiles()

  for (const file of files) {
    const lines = lineCount(file)
    assert.ok(lines < LIMIT, `${file} is ${lines} lines (limit ${LIMIT})`)
  }
})
