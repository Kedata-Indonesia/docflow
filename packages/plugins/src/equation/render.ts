/**
 * Equation (LaTeX) rendering — issue #255 (C1).
 *
 * Only `latex` (+ `numbered`/`label` on display) is persisted; the rendered
 * output is a derived view, exactly like citations — two clients with the same
 * source render identically, so Yjs stays conflict-free.
 */

import type { Node as PMNode } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'
import katex from 'katex'

const KATEX_OPTIONS = {
  throwOnError: false,
  // Never let user LaTeX reach raw HTML, \href or \includegraphics.
  trust: false,
  strict: 'ignore' as const,
  output: 'htmlAndMathml' as const,
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * KaTeX renders synchronously to HTML + MathML. With `trust: false` its output
 * is safe to inject: dangerous commands are escaped as text, not executed.
 */
export function renderEquation(latex: string, displayMode = false): string {
  const source = latex.trim()
  if (!source) return '<span class="docs-equation__placeholder">Empty equation</span>'
  try {
    return katex.renderToString(source, { ...KATEX_OPTIONS, displayMode })
  } catch {
    return `<span class="docs-equation__error">${escapeHtml(source)}</span>`
  }
}

export function readLatex(node: PMNode): string {
  return String((node.attrs as { latex?: unknown }).latex ?? '')
}

/**
 * Derived display-equation numbering (C2, issue #256): only `numbered`
 * equations consume a number, in document order. The number is written to the
 * NodeView's `[data-equation-number]` slot — never to attrs — so it cannot
 * mutate the document or re-trigger the transaction that produced it.
 */
export function updateEquationNumbers(view: EditorView): void {
  const numbers: string[] = []
  let count = 0
  view.state.doc.descendants((node) => {
    if (node.type.name !== 'displayEquation') return
    if (node.attrs.numbered) {
      count += 1
      numbers.push(`(${count})`)
    } else {
      numbers.push('')
    }
  })
  view.dom.querySelectorAll<HTMLElement>('[data-equation-number]').forEach((slot, index) => {
    const value = numbers[index] ?? ''
    if (slot.textContent !== value) slot.textContent = value
  })
}
