import type { EditorView } from '@tiptap/pm/view'
import type { ObserverGate } from './columnDom.js'
import { applyColumnWidthsToDom } from './columnDom.js'
import { findTablePos } from './tablePosition.js'

const FALLBACK_COLWIDTH = 100

export interface PersistColumnWidthsOptions {
  view: EditorView
  table: HTMLElement
  widths: number[]
  maxContainerW: number
  gate: ObserverGate
}

/**
 * Persist every column width through a ProseMirror transaction.
 *
 * Writing `colwidth` on all cells of all rows (not just the dragged column) is
 * the only way the table structure survives re-renders — typing, selection
 * changes, collaborative rebuilds. The DOM is repainted right after dispatch so
 * Chrome's `table-layout: fixed` renderer keeps the explicit widths.
 *
 * Falls back to plain DOM styling if the transaction throws, because losing a
 * drag is better than losing the table.
 */
export function persistColumnWidths(options: PersistColumnWidthsOptions): void {
  const { view, table, widths, maxContainerW, gate } = options

  try {
    const { state } = view
    const { doc } = state
    const tablePos = findTablePos(view, table)

    if (tablePos < 0) {
      console.warn('[Resize] could not find table position in doc')
      return
    }

    const tableNode = doc.nodeAt(tablePos)
    if (!tableNode) return

    const tr = state.tr
    // Walk rows → cells, update colwidth for ALL columns.
    tableNode.forEach((row, rowOffset) => {
      let cellColIdx = 0
      row.forEach((cell, cellOffset) => {
        const colspan = cell.attrs.colspan || 1
        const cellPos = tablePos + 1 + rowOffset + 1 + cellOffset
        const colwidth = new Array<number>(colspan)
        for (let k = 0; k < colspan; k++) {
          colwidth[k] = widths[cellColIdx + k] || FALLBACK_COLWIDTH
        }
        tr.setNodeMarkup(cellPos, null, { ...cell.attrs, colwidth })
        cellColIdx += colspan
      })
    })
    view.dispatch(tr)

    gate.pause()
    applyColumnWidthsToDom(table, widths, maxContainerW)
    gate.resume()
  } catch (error) {
    console.warn('[Resize] transaction failed, falling back to DOM:', error)
    gate.pause()
    applyColumnWidthsToDom(table, widths, maxContainerW)
    gate.resume()
  }
}
