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
 *
 * The patterns target the calls that can actually change a document — importing
 * ProseMirror (statically or dynamically), dispatching, replacing state, or
 * building transaction steps. A bare `dispatch(` in prose is ignored by
 * requiring a receiver.
 */
const FORBIDDEN: Array<{ label: string; pattern: RegExp }> = [
  { label: 'imports ProseMirror', pattern: /from\s+['"]@tiptap\/pm(\/[^'"]*)?['"]/ },
  { label: 'dynamic-imports ProseMirror', pattern: /import\s*\(\s*['"]@tiptap\/pm/ },
  { label: 'dispatches a transaction', pattern: /\b[\w$.]+\.dispatch\s*\(/ },
  { label: 'replaces editor state', pattern: /\.updateState\s*\(/ },
  { label: 'constructs a Transaction', pattern: /\bnew\s+Transaction\b/ },
  { label: 'builds steps on a state.tr', pattern: /\b[\w$]*[sS]tate\s*\.\s*tr\b/ },
  {
    label: 'mutates the doc through a transaction',
    pattern: /\b[a-zA-Z_$][\w$]*\.(?:replaceWith|replace|insert|delete|setNodeMarkup|addMark|removeMark)\s*\(/,
  },
  { label: 'implements appendTransaction', pattern: /\bappendTransaction\b/ },
]

describe('layout-engine purity (derived view, never a second editable model)', () => {
  it('source never touches ProseMirror state or dispatches transactions', () => {
    const files = collectSources(SRC_DIR)
    expect(files.length).toBeGreaterThan(0)

    const violations = files.flatMap((file) => {
      const source = readFileSync(file, 'utf8')
      return FORBIDDEN.filter(({ pattern }) => pattern.test(source)).map(
        ({ label }) => `${file.slice(SRC_DIR.length)}: ${label}`,
      )
    })

    expect(violations).toEqual([])
  })

  // A doc-mutating plugin commonly returns `this.state.tr.replaceWith(...)`
  // from `appendTransaction` without ever calling `dispatch(`. Make sure the
  // guard would catch that shape (regression test for the guard itself).
  it('the guard detects a doc-mutating appendTransaction plugin', () => {
    const plausibleViolation = [
      "import { Plugin } from '@tiptap/pm/state'",
      'export const p = new Plugin({',
      '  appendTransaction(_trs, _old, nextState) {',
      '    const tail = nextState.tr',
      '    tail.replaceWith(1, 2, nextState.schema.text("x"))',
      '    return tail',
      '  },',
      '})',
    ].join('\n')

    const hits = FORBIDDEN.filter(({ pattern }) => pattern.test(plausibleViolation))

    expect(hits.map(({ label }) => label)).toEqual([
      'imports ProseMirror',
      'builds steps on a state.tr',
      'mutates the doc through a transaction',
      'implements appendTransaction',
    ])
  })

  it('computePages() leaves its input blocks untouched, including when splitting', () => {
    const blocks: BlockInfo[] = [
      { nodeType: 'paragraph', from: 0, to: 40, top: 0, bottom: 200, canSplit: true },
    ]
    const snapshot = JSON.stringify(blocks)

    // 5px per character: 40 chars = 200px, so the block must split across the 100px page.
    const pages = new PageBreaker((_block, offset) => offset * 5).computePages(blocks, 100)

    expect(pages).toHaveLength(2)
    expect(pages[0].to).toBe(20)
    expect(pages[1].from).toBe(20)
    expect(JSON.stringify(blocks)).toBe(snapshot)
  })
})
