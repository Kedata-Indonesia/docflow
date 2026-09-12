import type { Editor } from '@tiptap/core'

/**
 * DOM element of the heading node at `pos`, or null when the node is not a
 * heading / no longer exists at that position.
 *
 * Used by the outline (TOC sidebar) to scroll to the heading a user clicked.
 * Resolving by POSITION instead of scanning heading `textContent` matters:
 * inline atoms (citation-backed footnotes, citations, page-number widgets)
 * render extra text into the heading DOM, so its textContent no longer equals
 * the label built from the node's text — and duplicate heading texts would
 * always resolve to the first occurrence.
 */
export function headingElementAt(editor: Editor, pos: number): HTMLElement | null {
  try {
    const node = editor.state.doc.nodeAt(pos)
    if (!node || node.type.name !== 'heading') return null
    const dom = editor.view.nodeDOM(pos)
    if (dom instanceof HTMLElement) return dom
    return dom?.parentElement instanceof HTMLElement ? dom.parentElement : null
  } catch {
    return null
  }
}
