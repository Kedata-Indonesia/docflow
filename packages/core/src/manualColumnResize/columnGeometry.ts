import { collectColumnWidths, getMaxContainerWidth, initialWidth } from './columnMeasure.js'

/**
 * Pointer geometry for `ManualColumnResize`: which logical column (colspan
 * aware) the pointer is grabbing, and the snapshot a drag needs.
 */

/** Distance (px) from a cell edge that still counts as grabbing the border. */
export const EDGE_TOLERANCE = 16
/** Any column narrower than this is unreadable, so drags clamp at it. */
export const MIN_COLUMN_WIDTH = 20

export interface CellHit {
  td: HTMLElement
  table: HTMLElement
  rect: DOMRect
  /** DOM child index inside the row — differs from the logical column index
   * when earlier cells are merged (#55). */
  domIndex: number
  /** Logical (colspan-aware) index of the first column the cell covers. */
  colStart: number
  span: number
  distLeft: number
  distRight: number
}

/**
 * Resolve the table cell under the pointer plus its logical column range.
 * Returns `null` when the event did not land inside a table cell.
 */
export function hitCell(event: MouseEvent): CellHit | null {
  const td = (event.target as HTMLElement).closest('td, th') as HTMLElement | null
  if (!td) return null

  const parent = td.parentElement
  if (!parent) return null

  const table = td.closest('table') as HTMLElement | null
  if (!table) return null

  // Merged cells make the DOM child index differ from the logical column index,
  // which is common in tables pasted from Google Docs/Word (#55). Without this,
  // widths get assigned to the wrong column.
  const children = Array.from(parent.children)
  let colStart = 0
  let foundCell = false
  for (const sibling of children) {
    if (sibling === td) {
      foundCell = true
      break
    }
    colStart += (sibling as HTMLTableCellElement).colSpan || 1
  }
  if (!foundCell) return null

  const rect = td.getBoundingClientRect()

  return {
    td,
    table,
    rect,
    domIndex: children.indexOf(td),
    colStart,
    span: (td as HTMLTableCellElement).colSpan || 1,
    distLeft: Math.abs(event.clientX - rect.left),
    distRight: Math.abs(event.clientX - rect.right),
  }
}

/**
 * Logical column whose border the pointer is on: the right edge resizes the
 * cell's last logical column, the left edge the column just before it.
 */
export function targetColumnForHit(hit: CellHit): number | null {
  if (hit.distRight <= EDGE_TOLERANCE) return hit.colStart + hit.span - 1
  if (hit.distLeft <= EDGE_TOLERANCE && hit.colStart > 0) return hit.colStart - 1
  return null
}

/** X coordinate of the border indicator for this hit, `null` when not an edge. */
export function borderXForHit(hit: CellHit): number | null {
  if (hit.distRight <= EDGE_TOLERANCE) return hit.rect.right
  if (hit.distLeft <= EDGE_TOLERANCE && hit.domIndex > 0) return hit.rect.left
  return null
}

export interface ResizePlan {
  table: HTMLElement
  /** Live width per column; mutated by the drag session. */
  widths: number[]
  targetColIdx: number
  neighborIdx: number
  isLastCol: boolean
  startX: number
  startW: number
  startNeighborW: number
  maxContainerW: number
  maxNwLastCol: number
}

/**
 * Snapshot everything a drag needs: column widths, the column being dragged,
 * its neighbour (redistributive drags) and the clamps.
 *
 * The neighbour absorbs the delta in redistributive mode. The last column has
 * no neighbour — its right border resizes the total table width instead, so it
 * is clamped against the container (#116).
 */
export function buildResizePlan(
  table: HTMLElement,
  targetColIdx: number,
  startX: number,
): ResizePlan {
  const { widths, totalCols } = collectColumnWidths(table)
  const isLastCol = targetColIdx === totalCols - 1
  const neighborIdx = targetColIdx + 1
  const startW = widths[targetColIdx] || initialWidth(table, targetColIdx)
  const startNeighborW = !isLastCol
    ? (widths[neighborIdx] || initialWidth(table, neighborIdx))
    : 0

  // Only used to clamp the last-column (total-width) resize so the table never
  // overflows the page; internal-border drags keep the total width constant.
  const maxContainerW = getMaxContainerWidth(table)
  let otherColsW = 0
  widths.forEach((width, idx) => {
    if (idx !== targetColIdx) otherColsW += width
  })

  return {
    table,
    widths,
    targetColIdx,
    neighborIdx,
    isLastCol,
    startX,
    startW,
    startNeighborW,
    maxContainerW,
    maxNwLastCol: Math.max(MIN_COLUMN_WIDTH, maxContainerW - otherColsW),
  }
}
