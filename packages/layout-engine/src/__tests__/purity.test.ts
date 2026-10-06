import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PageBreaker } from '../PageBreaker'
import type { BlockInfo } from '../types'

/**
 * `.../packages/layout-engine/src` — this file lives in `src/__tests__/`.
 * `import.meta.dirname` is not used because the happy-dom environment only
 * guarantees `import.meta.url`; `new URL()` is avoided because happy-dom
 * replaces the global `URL` with a DOM-relative implementation.
 */
const SRC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function collectSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : collectSources(full)
    }
    return entry.name.endsWith('.ts') ? [full] : []
  })
}

/**
 * Invariant documented in `docs/ARCHITECTURE.md` §2.1 and required by issue
 * #43: the layout engine is a *derived read model*. It measures the DOM but
 * must never mutate ProseMirror document state.
 */
describe('layout-engine purity (derived view, never a second editable model)', () => {
  const forbidden: Array<{ label: string; pattern: RegExp }> = [
    { label: 'imports @tiptap/pm state', pattern: /from\s+'@tiptap\/pm\/state'/ },
    { label: 'imports @tiptap/pm view', pattern: /from\s+'@tiptap\/pm\/view'/ },
    { label: 'imports @tiptap/pm model', pattern: /from\s+'@tiptap\/pm\/model'/ },
    { label: 'dispatches a transaction', pattern: /\bdispatch\s*\(/ },
    { label: 'calls view.updateState()', pattern: /\.updateState\s*\(/ },
    { label: 'constructs a Transaction', pattern: /\bnew\s+Transaction\b/ },
  ]

  it('source never touches ProseMirror state or dispatches transactions', () => {
    const files = collectSources(SRC_DIR)
    expect(files.length).toBeGreaterThan(0)

    const violations = files.flatMap((file) => {
      const source = readFileSync(file, 'utf8')
      return forbidden
        .filter(({ pattern }) => pattern.test(source))
        .map(({ label }) => `${file.slice(SRC_DIR.length)}: ${label}`)
    })

    expect(violations).toEqual([])
  })

  it('computePages() leaves its input blocks untouched', () => {
    const blocks: BlockInfo[] = [
      { nodeType: 'paragraph', from: 0, to: 10, top: 0, bottom: 40, canSplit: true },
      { nodeType: 'paragraph', from: 10, to: 20, top: 40, bottom: 80, canSplit: true },
      { nodeType: 'paragraph', from: 20, to: 30, top: 80, bottom: 120, canSplit: true },
    ]
    const snapshot = JSON.stringify(blocks)

    const pages = new PageBreaker().computePages(blocks, 100)

    expect(pages).toHaveLength(2)
    expect(JSON.stringify(blocks)).toBe(snapshot)
  })
})
