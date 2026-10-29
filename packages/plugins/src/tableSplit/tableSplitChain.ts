import type { Node as PMNode, NodeType } from '@tiptap/pm/model'
import { findSplitRow, rowBoundaryOffset, tailMeasurements } from './tableSplitRows.js'
import { MAX_SPLIT_DEPTH, SPLIT_MARK, type RowMeasurement } from './tableSplitTypes.js'

/**
 * Split `tableNode` into the sibling tables that fit the page budgets.
 *
 * Only the FIRST cut in this chain uses the caller-supplied head budget (which
 * may be a reduced mid-page budget for tables after the first in a paste).
 * Every cut after that starts a fresh page, so it always gets the full
 * `pageContentPx` — never the (possibly reduced) head budget.
 *
 * Adjacent tables: no separator paragraph. An empty paragraph between two
 * tables inherits `.ProseMirror p { margin: 0.5rem 0 !important; line-height:
 * 1.6 !important; }` — roughly 38 px per separator. For a chain of N chunks
 * that's (N-1)*38 px of vertical overhead pushing the LAST chunk onto the next
 * page. Adjacent tables render flush (the table's own margin-bottom + next
 * table's margin-top collapse to a few px) and the page-break decoration
 * provides visual separation when needed.
 */
export function buildSplitChain(
  tableNode: PMNode,
  measurements: RowMeasurement[],
  headBudgetPx: number,
  pageContentPx: number,
  tableType: NodeType,
  depth: number,
): PMNode[] {
  const budget = depth === 0 ? headBudgetPx : pageContentPx
  const splitRow = findSplitRow(measurements, budget)
  if (splitRow < 0) return [tableNode]
  if (depth >= MAX_SPLIT_DEPTH) return [tableNode]

  const splitPos = rowBoundaryOffset(tableNode, splitRow)
  const content = tableNode.content
  const leftContent = content.cut(0, splitPos)
  const rightContent = content.cut(splitPos)

  const leftAttrs = { ...tableNode.attrs, tablePageSplit: SPLIT_MARK }
  const rightAttrs = { ...tableNode.attrs, tablePageSplit: null }
  const leftTable = tableType.create(leftAttrs, leftContent, tableNode.marks)
  const rightTable = tableType.create(rightAttrs, rightContent, tableNode.marks)

  // Row-count invariant (defensive): the split must be a permutation of the
  // original rows. If Fragment.cut ever shared rows across halves we would
  // see leftCount + rightCount !== expected. Throw loudly rather than
  // silently duplicate content into the document.
  const expectedRows = tableNode.childCount
  const leftRows = leftTable.childCount
  const rightRows = rightTable.childCount
  if (leftRows + rightRows !== expectedRows) {
    throw new Error(
      '[tablePageSplitPlugin] row-count invariant violated: ' +
        `expected ${expectedRows}, got ${leftRows} + ${rightRows} ` +
        `= ${leftRows + rightRows}`,
    )
  }

  const tail = tailMeasurements(measurements, splitRow)
  const tailChain = buildSplitChain(
    rightTable,
    tail,
    headBudgetPx,
    pageContentPx,
    tableType,
    depth + 1,
  )

  if (tailChain.length === 1) {
    return [leftTable, rightTable]
  }
  return [leftTable, ...tailChain]
}
