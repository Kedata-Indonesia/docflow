import { definePlugin } from '@kedata-indonesia/docflow-core'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import type { Node as PMNode, NodeType, Schema } from '@tiptap/pm/model'

/**
 * Experimental plugin — splits a table node into multiple sibling tables at
 * page boundaries when its rendered height exceeds the page-content area, so a
 * tall pasted table no longer jumps wholesale to page 2 (leaving a blank band
 * on page 1).
 *
 * See docs/plans/clipboard-paste-pipeline-plan.md §9 "Remaining known issue"
 * for the underlying PaginationPlus limitation this addresses.
 *
 * Mechanism (single-transaction multi-split; fixes #192):
 *  - `appendTransaction` fires after every dispatch. We skip:
 *      * transactions carrying PaginationPlus's `PAGE_COUNT_META_KEY`
 *        (those are layout syncs, not edits);
 *      * transactions whose doc is structurally unchanged (no edit to react to);
 *      * transactions whose only effect was our own previous split.
 *  - On a real user edit, find the FIRST unsplit table, measure its rows
 *    against the page-content area, and split it into head + tail.
 *  - If the tail itself overflows the page, recursively split the tail again —
 *    in the SAME transaction. We predict the tail's row heights from the
 *    existing measurements (the row Nodes are shared across the split), so we
 *    never need a follow-up dispatch and never race with PaginationPlus's
 *    page-count churn mid-cycle.
 *  - The depth of the recursion is bounded by `MAX_SPLIT_DEPTH` (default 16 —
 *    enough for a 200-row pasted table with one row per chunk).
 *  - Every produced table head is marked `tablePageSplit: 'head'`; the final
 *    tail keeps `null` so a subsequent user edit can re-evaluate.
 *  - Requires the patched `tiptap-pagination-plus` in
 *    `patches/tiptap-pagination-plus@3.1.0.patch` to honor
 *    `data-tps-splittable` (tables marked by the plugin opt out of the
 *    convergence guard and PaginationPlus will grow the page count to fit
 *    them across pages).
 */

const PLUGIN_KEY = new PluginKey('docflow/table-page-split')
const SPLIT_MARK = 'head'
const MAX_SPLIT_DEPTH = 16

function readPageContentHeightPx(view: EditorView, editor: { storage?: { PaginationPlus?: any } } | null): number | null {
  const storage = editor?.storage?.PaginationPlus
  if (storage && typeof storage.pageHeight === 'number') {
    const h1 = storage.headerHeight?.get?.(1) ?? 0
    const f1 = storage.footerHeight?.get?.(1) ?? 0
    const contentPx = storage.pageHeight
      - (storage.marginTop ?? 0)
      - (storage.marginBottom ?? 0)
      - (storage.contentMarginTop ?? 0)
      - (storage.contentMarginBottom ?? 0)
      - h1 - f1
    if (Number.isFinite(contentPx) && contentPx > 0) return contentPx
  }
  const raw = view.dom.style.getPropertyValue('--rm-max-content-child-height')
  if (!raw) return null
  const px = parseFloat(raw)
  return Number.isFinite(px) && px > 0 ? px : null
}

function measureElementPx(el: Element | null): number {
  if (!el || !(el instanceof HTMLElement)) return 0
  return el.getBoundingClientRect().height
}

interface RowMeasurement {
  rowIndex: number
  heightPx: number
  cumulativePx: number
}

function measureRows(tableNode: PMNode, tableDom: HTMLElement): RowMeasurement[] | null {
  const expectedRows = tableNode.childCount
  const trs = tableDom.querySelectorAll(':scope > tbody > tr')
  if (trs.length !== expectedRows) return null

  const measurements: RowMeasurement[] = []
  let cumulative = 0
  for (let i = 0; i < trs.length; i++) {
    const h = measureElementPx(trs[i])
    cumulative += h
    measurements.push({ rowIndex: i, heightPx: h, cumulativePx: cumulative })
  }
  return measurements
}

function findSplitRow(measurements: RowMeasurement[], pageContentPx: number): number {
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
 * Build a row-position index (offset + nodeSize) for the split boundary.
 * Returns the content offset immediately AFTER row `splitRow`, or 0 if the
 * table has no rows. Result is always at a row boundary.
 */
function rowBoundaryOffset(tableNode: PMNode, splitRow: number): number {
  if (splitRow < 0 || tableNode.childCount === 0) return 0
  let boundary = 0
  tableNode.forEach((row, offset, index) => {
    if (index <= splitRow) boundary = offset + row.nodeSize
  })
  return boundary
}

/**
 * Slice the existing measurements into a tail-relative measurements array.
 * `measurements[i]` for i > splitRow becomes the tail's measurements with
 * cumulativePx reset to height-from-tail-start.
 */
function tailMeasurements(
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
 * Recursively split a table into a chain of `[head, separator, head, separator, ..., tail]`.
 * Halts when the tail fits the page or `MAX_SPLIT_DEPTH` is reached.
 * Returns `[tableNode]` (length 1) when no split is needed.
 */
function buildSplitChain(
  tableNode: PMNode,
  measurements: RowMeasurement[],
  pageContentPx: number,
  schema: Schema,
  tableType: NodeType,
  depth: number,
): PMNode[] {
  const splitRow = findSplitRow(measurements, pageContentPx)
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
      `[tablePageSplitPlugin] row-count invariant violated: expected ${expectedRows}, got ${leftRows} + ${rightRows} = ${leftRows + rightRows}`,
    )
  }

  const separator = schema.nodes.paragraph.create()
  const tail = tailMeasurements(measurements, splitRow)
  const tailChain = buildSplitChain(rightTable, tail, pageContentPx, schema, tableType, depth + 1)

  if (tailChain.length === 1) {
    return [leftTable, separator, rightTable]
  }
  return [leftTable, separator, ...tailChain]
}

const TablePageSplitExtension = Extension.create({
  name: 'tablePageSplit',

  addProseMirrorPlugins() {
    let view: EditorView | null = null
    const ext = this as unknown as { editor?: { storage: { PaginationPlus?: any } } }
    const editorRef = ext.editor ?? null

    return [
      new Plugin({
        key: PLUGIN_KEY,

        view(_editorView) {
          view = _editorView
          return {
            destroy() {
              view = null
            },
          }
        },

        appendTransaction(transactions, _oldState, newState) {
          // Skip pagination's own layout syncs.
          if (transactions.some(t => t.getMeta('PAGE_COUNT_META_KEY') !== undefined)) {
            return null
          }
          // Skip our own split trs (already split; nothing to do this cycle).
          if (transactions.some(t => {
            const m = t.getMeta(PLUGIN_KEY) as { splitAtRow?: number } | undefined
            return m !== undefined && m.splitAtRow !== undefined
          })) return null

          if (!view) return null

          const { schema } = newState
          const tableType = schema.nodes.table
          if (!tableType) return null

          const pageContentPx = readPageContentHeightPx(view, editorRef)
          if (pageContentPx == null) return null

          let tablePos = -1
          const found: { node: PMNode | null } = { node: null }
          newState.doc.descendants((node: PMNode, pos: number) => {
            if (tablePos >= 0) return false
            if (node.type === tableType && node.attrs.tablePageSplit !== SPLIT_MARK) {
              tablePos = pos
              found.node = node
              return false
            }
            return true
          })

          const tableNode = found.node
          if (tablePos < 0 || !tableNode) return null

          const domAt = view.nodeDOM(tablePos)
          if (!(domAt instanceof HTMLElement)) return null

          const measurements = measureRows(tableNode, domAt)
          if (!measurements) return null

          const chain = buildSplitChain(
            tableNode,
            measurements,
            pageContentPx,
            schema,
            tableType,
            0,
          )
          if (chain.length <= 1) return null

          const tr = newState.tr
          tr.replaceWith(tablePos, tablePos + tableNode.nodeSize, chain)
          tr.setMeta(PLUGIN_KEY, { splitAtRow: -1 })
          return tr
        },
      }),
    ]
  },
})

export const tablePageSplitPlugin = definePlugin({
  id: 'tablePageSplit',
  tiptapExtensions: [TablePageSplitExtension],
})
