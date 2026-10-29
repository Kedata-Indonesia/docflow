import { borderXForHit, hitCell } from './columnGeometry.js'
import type { ResizeLine } from './resizeLine.js'

export interface HoverIndicatorOptions {
  line: ResizeLine
  /** True while a drag owns the pointer — the hover line must stay hidden. */
  isDragging: () => boolean
}

export interface HoverIndicator {
  attach: () => void
  detach: () => void
}

/**
 * Show the cyan border hint while the pointer hovers a column border.
 *
 * Capture phase, so the hint tracks the pointer even when ProseMirror stops
 * propagation on its own handlers.
 */
export function createHoverIndicator(options: HoverIndicatorOptions): HoverIndicator {
  const { line, isDragging } = options

  function onMouseMove(event: MouseEvent): void {
    if (isDragging()) return

    const hit = hitCell(event)
    if (!hit) {
      line.hide()
      return
    }

    const borderX = borderXForHit(hit)
    if (borderX === null) {
      line.hide()
      return
    }

    line.show(hit.table, borderX)
  }

  return {
    attach: () => document.addEventListener('mousemove', onMouseMove, true),
    detach: () => document.removeEventListener('mousemove', onMouseMove, true),
  }
}
