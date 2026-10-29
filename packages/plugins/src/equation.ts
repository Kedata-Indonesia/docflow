import type { Editor } from '@tiptap/core'
import { definePlugin } from '@kedata-indonesia/docflow-core'
import { DisplayEquationNode } from './equation/displayNode.js'
import { InlineEquationNode } from './equation/inlineNode.js'
import { EquationState } from './equation/state.js'
import { insertDisplayNode } from './equation/transactions.js'

/**
 * Equation (LaTeX) — issue #255 (C1).
 *
 * Two atom nodes, never one: ProseMirror nodes are either inline or block.
 * Only `latex` (+ `numbered`/`label` on display) is persisted; the rendered
 * output is a derived view, exactly like citations — two clients with the same
 * source render identically, so Yjs stays conflict-free.
 *
 * This module is the plugin manifest; the node views live in
 * `equation/{inlineNode,displayNode}.ts`, KaTeX rendering in
 * `equation/render.ts`, and the shared transactions in
 * `equation/transactions.ts`.
 */

export type { EquationStorage } from './equation/transactions.js'
export { renderEquation, updateEquationNumbers } from './equation/render.js'
export { EquationState } from './equation/state.js'

export const equationPlugin = definePlugin({
  id: 'equation',
  tiptapExtensions: [EquationState, InlineEquationNode, DisplayEquationNode],
  toolbar: [
    {
      id: 'insert-inline-equation',
      label: 'Inline equation',
      labelKey: 'header.inlineEquation',
      action: 'insertInlineEquation',
      iconComponent: 'Sigma',
    },
    {
      id: 'insert-equation',
      label: 'Equation',
      labelKey: 'header.equation',
      action: 'insertDisplayEquation',
      iconComponent: 'Sigma',
    },
    {
      id: 'insert-numbered-equation',
      label: 'Numbered equation',
      labelKey: 'header.numberedEquation',
      action: 'insertNumberedEquation',
      iconComponent: 'Sigma',
    },
  ],
  slashCommands: [
    { name: 'Inline equation', nameKey: 'header.inlineEquation', command: 'insertInlineEquation' },
    { name: 'Equation', nameKey: 'header.equation', command: 'insertDisplayEquation' },
    { name: 'Numbered equation', nameKey: 'header.numberedEquation', command: 'insertNumberedEquation' },
  ],
  commands: {
    insertInlineEquation: (editor: Editor, ...args: unknown[]) => {
      const latex = (args[0] as { latex?: string } | undefined)?.latex ?? ''
      return editor
        .chain()
        .focus()
        .insertContent({ type: 'inlineEquation', attrs: { latex } })
        .run()
    },
    insertDisplayEquation: (editor: Editor, ...args: unknown[]) => {
      const attrs = args[0] as { latex?: string; numbered?: boolean; label?: string | null } | undefined
      return insertDisplayNode(editor, attrs?.numbered ?? false, attrs)
    },

    insertNumberedEquation: (editor: Editor, ...args: unknown[]) => {
      const attrs = args[0] as { latex?: string; label?: string | null } | undefined
      return insertDisplayNode(editor, true, attrs)
    },
  },
})

export const inlineEquationNode = InlineEquationNode
export const displayEquationNode = DisplayEquationNode
