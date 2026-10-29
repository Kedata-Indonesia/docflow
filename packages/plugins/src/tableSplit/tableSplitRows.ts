import type { Node as PMNode } from '@tiptap/pm/model'
import { MAX_SPLIT_DEPTH, type RowMeasurement } from './tableSplitTypes.js'

/** Last row index whose cumulative height still fits `pageContentPx`. */
export function findSplitRow(measurements: RowMeasurement[], pageContentPx: number): number {
  if (measurements.length < 2) return -1
  if (measurements[measurements.length - 1].cumulativePx <= pageContentPx) return -1

  let lo = 0
  let hi = measurements.length - 2
  let best = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (measurements[mid].cumulativePx <= pageContentPx) {
      best = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return best
}

/**
 * Budget for the FIRST cut of a table, given the space left on the current
 * page.
 *
 * A table that does not fit even its first row in the leftover space has to
 * start on the NEXT page — that is what every word processor does, and it is
 * the only alternative to overflowing the current page. So it gets the full
 * page-content budget instead of the leftover.
 *
 * Why this matters (issue #163): tables are processed in document order with a
 * running cursor, so a table that follows a split chain inherits what the chain
 * left over — which can be smaller than one of its rows (measured case: 282 px
 * left, first row 403 px). Passing that as the head budget made `findSplitRow`
 * return -1, `buildSplitChain` return the table UNSplit, and a ~2.5-page table
 * was left whole in the document. PaginationPlus then kept inserting empty
 * pages trying to push that table onto one page (7 breaks for ~6 pages of
 * content, ~5.100 px blank band above the table).
 *
 * The other two cases keep the leftover budget: the whole table fits in it (no
 * split at all), or at least its first row fits (it starts on the current page
 * and continues on the next).
 */
export function resolveHeadBudget(
  measurements: RowMeasurement[],
  availablePx: number,
  pageContentPx: number,
): number {
  if (measurements.length === 0) return availablePx
  const totalPx = measurements[measurements.length - 1].cumulativePx
  if (totalPx <= availablePx) return availablePx
  if (measurements[0].heightPx <= availablePx) return availablePx
  return pageContentPx
}

/** Content offset just past row `splitRow` (0 when there is nothing to cut). */
export function rowBoundaryOffset(tableNode: PMNode, splitRow: number): number {
  if (splitRow < 0 || tableNode.childCount === 0) return 0
  let boundary = 0
  tableNode.forEach((row, offset, index) => {
    if (index <= splitRow) boundary = offset + row.nodeSize
  })
  return boundary
}

/** Re-base the measurements that come after `splitRow` onto a fresh page. */
export function tailMeasurements(
  measurements: RowMeasurement[],
  splitRow: number,
): RowMeasurement[] {
  const tail: RowMeasurement[] = []
  let cumulative = 0
  for (let i = splitRow + 1; i < measurements.length; i++) {
    cumulative += measurements[i].heightPx
    tail.push({ rowIndex: i, heightPx: measurements[i].heightPx, cumulativePx: cumulative })
  }
  return tail
}

/**
 * Height (px) of the LAST chunk `buildSplitChain` would produce for this
 * table, given the same head/page budgets it actually uses. Walks the same
 * split-row sequence as `buildSplitChain` (head cut uses `headBudgetPx`,
 * every cut after that uses `pageContentPx`) directly over `RowMeasurement`s
 * — no PMNodes needed — so it can never disagree with what buildSplitChain
 * actually produces. Used only to advance the cursor for whatever table
 * comes after this one in the pass.
 *
 * Returns `null` if the table doesn't split at all (whole table height is
 * the "last chunk" and the caller should treat it as staying on the same
 * page as headBudgetPx, not a fresh one).
 */
export function lastChunkHeightPx(
  measurements: RowMeasurement[],
  headBudgetPx: number,
  pageContentPx: number,
): number | null {
  let current = measurements
  let budget = headBudgetPx
  let splitCount = 0
  for (let depth = 0; depth < MAX_SPLIT_DEPTH; depth++) {
    const splitRow = findSplitRow(current, budget)
    if (splitRow < 0) {
      return splitCount === 0 ? null : (current[current.length - 1]?.cumulativePx ?? 0)
    }
    splitCount++
    current = tailMeasurements(current, splitRow)
    budget = pageContentPx
  }
  return current[current.length - 1]?.cumulativePx ?? 0
}
