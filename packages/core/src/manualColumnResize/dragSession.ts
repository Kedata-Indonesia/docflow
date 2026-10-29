import type { EditorView } from '@tiptap/pm/view'
import type { ObserverGate } from './columnDom.js'
import { applyColumnWidthsToDom } from './columnDom.js'
import type { ResizePlan } from './columnGeometry.js'
import { MIN_COLUMN_WIDTH } from './columnGeometry.js'
import { persistColumnWidths } from './persistColwidths.js'
import type { ResizeLine } from './resizeLine.js'

export interface BeginResizeOptions {
  view: EditorView
  plan: ResizePlan
  gate: ObserverGate
  line: ResizeLine
  /** The mousedown that started the drag. */
  event: MouseEvent
}

/**
 * Start a column drag from a mousedown on a cell border. Returns immediately;
 * the drag is driven by document-level `mousemove`/`mouseup` listeners.
 *
 * Two modes:
 * - internal border → the dragged column grows by Δ while its right neighbour
 *   shrinks by Δ, so the table keeps its total width (#116);
 * - last column    → only the table's total width grows, clamped to the paper.
 *
 * Live feedback writes the DOM directly (inside the observer gate); the widths
 * are persisted once on mouseup — a transaction per mousemove would flood the
 * history and the collaboration channel.
 */
export function beginResize(options: BeginResizeOptions): void {
  const { view, plan, gate, line, event } = options
  const { table, widths, targetColIdx, neighborIdx, isLastCol } = plan
  const { startX, startW, startNeighborW, maxNwLastCol, maxContainerW } = plan

  // stopPropagation prevents ProseMirror from handling mousedown (capture phase
  // fires before ProseMirror's bubble-phase handler). Do NOT call
  // preventDefault() — the browser needs it for mousemove `e.buttons`.
  event.stopPropagation()

  let lastNw = startW

  const onMove = function (moveEvent: MouseEvent) {
    if (!moveEvent.buttons) {
      onUp(moveEvent)
      return
    }

    const rawDiff = moveEvent.clientX - startX

    if (isLastCol) {
      // Total-width resize: only the dragged (last) column changes.
      const nextWidth = Math.min(maxNwLastCol, Math.max(MIN_COLUMN_WIDTH, startW + rawDiff))
      widths[targetColIdx] = nextWidth
      lastNw = nextWidth
    } else {
      // Redistributive resize (#116): clamp Δ so neither column drops below the
      // minimum — upper bound keeps the neighbour ≥ 20, lower bound the target.
      const delta = Math.max(
        MIN_COLUMN_WIDTH - startW,
        Math.min(rawDiff, startNeighborW - MIN_COLUMN_WIDTH),
      )
      widths[targetColIdx] = startW + delta
      widths[neighborIdx] = startNeighborW - delta
      lastNw = widths[targetColIdx]
    }

    // Live cyan line at the dragged border position during the drag.
    let borderPos = table.getBoundingClientRect().left
    for (let i = 0; i <= targetColIdx; i++) borderPos += widths[i]
    line.show(table, borderPos)

    gate.pause()
    applyColumnWidthsToDom(table, widths, maxContainerW)
    gate.resume()
  }

  const onUp = function (upEvent: MouseEvent) {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp, true)
    upEvent.stopPropagation()
    line.hide()

    if (lastNw === startW) return

    // `widths` is already up to date from onMove — persist it now.
    persistColumnWidths({ view, table, widths, maxContainerW, gate })
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp, true)
}
