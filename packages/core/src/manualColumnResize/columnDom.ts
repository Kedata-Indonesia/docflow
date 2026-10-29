import type { EditorView } from '@tiptap/pm/view'

/**
 * DOM writes for `ManualColumnResize`, plus the DOMObserver gate.
 *
 * Editing the table's inline widths while ProseMirror watches the DOM makes it
 * "helpfully" re-render and revert them, so every write is wrapped in
 * `pause()`/`resume()`.
 */

export interface ObserverGate {
  pause: () => void
  resume: () => void
}

/**
 * ProseMirror's `domObserver` is internal and not part of the public typings,
 * hence the narrow structural cast.
 */
export function createObserverGate(view: EditorView): ObserverGate {
  const observer = view as unknown as {
    domObserver?: { stop?: () => void; start?: () => void }
  }

  return {
    pause: () => {
      try {
        observer.domObserver?.stop?.()
      } catch {
        // No observer on this view — nothing to pause.
      }
    },
    resume: () => {
      try {
        observer.domObserver?.start?.()
      } catch {
        // No observer on this view — nothing to resume.
      }
    },
  }
}

/**
 * Push `widths` onto `<col>`, every `<td>` and the `<table>` itself.
 *
 * `<colgroup>` drives the layout under `table-layout: fixed`; the per-cell
 * writes reinforce it so Chrome keeps explicit widths for all columns.
 */
export function applyColumnWidthsToDom(
  table: HTMLElement,
  widths: number[],
  maxContainerW: number,
): void {
  let totalWidth = 0

  widths.forEach((width, idx) => {
    const col = table.querySelector(`colgroup col:nth-child(${idx + 1})`) as HTMLElement | null
    if (col) col.style.setProperty('width', `${width}px`, 'important')

    table.querySelectorAll('tr').forEach((row) => {
      const cell = row.children[idx] as HTMLElement | undefined
      if (!cell) return
      cell.style.setProperty('width', `${width}px`, 'important')
      cell.setAttribute('width', String(width))
    })

    totalWidth += width
  })

  if (totalWidth > 0) {
    table.style.setProperty('width', `${Math.min(totalWidth, maxContainerW)}px`, 'important')
  }
}
