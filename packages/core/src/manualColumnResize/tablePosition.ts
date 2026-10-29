import type { EditorView } from '@tiptap/pm/view'

/**
 * Locate the ProseMirror position of a DOM table.
 *
 * A table can appear several times in a document, so the node is matched by DOM
 * identity (or containment, for tables wrapped by another node view) rather than
 * by index. Returns `-1` when the table is not part of the current document.
 */
export function findTablePos(view: EditorView, table: HTMLElement): number {
  let tablePos = -1

  view.state.doc.descendants((node, pos) => {
    if (tablePos >= 0) return false
    if (node.type.name !== 'table') return true

    try {
      const dom = view.nodeDOM(pos)
      if (
        dom === table
        || (dom instanceof HTMLElement && dom.contains(table))
        || table.contains(dom as HTMLElement)
      ) {
        tablePos = pos
        return false
      }
    } catch {
      // Node without a rendered DOM — keep searching.
    }
    return true
  })

  return tablePos
}
