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
 * Mechanism (deferred multi-split; fixes #192 + the multi-table paste skip):
 *  - `appendTransaction` runs DURING `EditorView.dispatch`, BEFORE the view's
 *    DOM has been updated to reflect the dispatched doc change. Trying to
 *    read `<tr>` heights at that point returns nothing for newly added
 *    content — only nodes that already existed in the OLD DOM can be measured
 *    via `view.nodeDOM(pos)`. For a paste that adds multiple tables, only the
 *    first (or none) would be measurable, leaving later tables with the
 *    blank-space-above-table symptom.
 *  - We sidestep the stale-DOM problem by deferring the full measurement +
 *    multi-table split to `queueMicrotask`. By the time the microtask runs,
 *    the view has called `updateState(newState)` and the DOM matches the doc,
 *    so every newly added table is measurable.
 *  - We coalesce multiple `appendTransaction` cycles into a single
 *    microtask via a `pendingRun` flag so a paste that dispatches several
 *    intermediate trs still produces one split pass — not one per tr.
 *  - When the split pass dispatches its own tr back through the editor, the
 *    resulting `appendTransaction` cycle is detected via `PLUGIN_KEY` meta
 *    and skipped, avoiding recursion.
 *  - Each table's recursion predicts the tail's row heights from the
 *    existing measurements (the row Nodes are shared across the split),
 *    so each individual split converges in O(log n) within one tr.
 */

const PLUGIN_KEY = new PluginKey('docflow/table-page-split')
const SPLIT_MARK = 'head'
const MAX_SPLIT_DEPTH = 16

function readPageContentHeightPx(view: EditorView, editor: { storage?: { PaginationPlus?: any } } | null): number | null {
  // Primary source: editor.storage.PaginationPlus.pageHeight minus margins.
  // This matches the page-content area the editor renders against, regardless
  // of which page (first vs later) the table ends up on — both pages use the
  // same `_pageHeight` calculation (the difference is whether the header is
  // *inside* the page or floating above it; either way the table fits in
  // `_pageHeight`).
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
  // Fallback: the CSS variable PaginationPlus exposes. Useful in tests where
  // storage hasn't been populated yet but the variable is set manually.
  const raw = view.dom.style.getPropertyValue('--rm-max-content-child-height')
  if (raw) {
    const px = parseFloat(raw)
    if (Number.isFinite(px) && px > 0) return px
  }
  return null
}

function measureElementPx(el: Element | null): number {
  if (!el || !(el instanceof HTMLElement)) return 0
  return el.getBoundingClientRect().height
}

/**
 * Return the vertical space still available on the page at the given PM
 * position, in pixels, using the live (pre-split) DOM.
 *
 * IMPORTANT: this reads `.breaker` positions from the CURRENT DOM, which
 * only reflects splits that have already been dispatched — not splits still
 * pending in this same `runSplitPass` call. Do not call this for a table
 * that comes after another table in document order within the same pass;
 * use `availablePxFromCursor` instead, which accounts for the pending
 * chain output of everything before it. This is only correct for the
 * FIRST table processed in a pass (nothing pending ahead of it yet).
 */
function availablePxAt(
  view: EditorView,
  pos: number,
  defaultPageContentPx: number,
): number | null {
  try {
    const tableCoords = view.coordsAtPos(pos + 1)
    const tableTop = tableCoords.top
    const paginationWrapper = view.dom.querySelector('[data-rm-pagination]')
    if (!paginationWrapper) return defaultPageContentPx
    const breakers = paginationWrapper.querySelectorAll('.rm-page-break .breaker')
    for (let i = 0; i < breakers.length; i++) {
      const br = breakers[i]
      if (!(br instanceof HTMLElement)) continue
      const breakTop = br.getBoundingClientRect().top
      if (breakTop > tableTop) {
        return Math.max(1, Math.floor(breakTop - tableTop))
      }
    }
    return defaultPageContentPx
  } catch {
    return null
  }
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

function rowBoundaryOffset(tableNode: PMNode, splitRow: number): number {
  if (splitRow < 0 || tableNode.childCount === 0) return 0
  let boundary = 0
  tableNode.forEach((row, offset, index) => {
    if (index <= splitRow) boundary = offset + row.nodeSize
  })
  return boundary
}

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

function buildSplitChain(
  tableNode: PMNode,
  measurements: RowMeasurement[],
  headBudgetPx: number,
  pageContentPx: number,
  schema: Schema,
  tableType: NodeType,
  depth: number,
): PMNode[] {
  // Only the FIRST cut in this chain uses the caller-supplied head budget
  // (which may be a reduced mid-page budget for tables after the first in
  // a paste). Every cut after that starts a fresh page, so it always gets
  // the full `pageContentPx` — never the (possibly reduced) head budget.
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
      `[tablePageSplitPlugin] row-count invariant violated: expected ${expectedRows}, got ${leftRows} + ${rightRows} = ${leftRows + rightRows}`,
    )
  }

  // Adjacent tables: no separator paragraph. An empty paragraph between two
  // tables inherits `.ProseMirror p { margin: 0.5rem 0 !important; line-height:
  // 1.6 !important; }` — roughly 38 px per separator. For a chain of N chunks
  // that's (N-1)*38 px of vertical overhead pushing the LAST chunk onto the next
  // page. Adjacent tables render flush (the table's own margin-bottom +
  // next table's margin-top collapse to a few px) and the page-break
  // decoration provides visual separation when needed.
  const tail = tailMeasurements(measurements, splitRow)
  const tailChain = buildSplitChain(rightTable, tail, headBudgetPx, pageContentPx, schema, tableType, depth + 1)

  if (tailChain.length === 1) {
    return [leftTable, rightTable]
  }
  return [leftTable, ...tailChain]
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
function lastChunkHeightPx(
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

/**
 * Run a complete multi-table split pass against the live view state. Caller
 * is responsible for ensuring this runs at a point where the DOM matches the
 * current doc — `appendTransaction` cannot do this directly because the
 * DOM update happens after `applyTransaction` returns.
 *
 * Tables are processed in document order with a running page-budget
 * cursor, NOT independently against a single fixed pageContentPx. Reason:
 * `state.doc.descendants()` walks the doc BEFORE any of this pass's splits
 * are dispatched, so live-DOM reads (`availablePxAt`) for the 2nd+ table
 * reflect a layout that's about to change once the 1st table's chain is
 * applied — the .breaker the 2nd table sees is positioned for "table 1
 * whole", not "table 1 split". That mismatch is why a smarter per-position
 * formula alone doesn't fix the 2nd-table gap: the input for table 2 is
 * already stale before the formula runs.
 *
 * Fix: only the FIRST table in the pass uses the live-DOM budget (nothing
 * ahead of it has changed). Every table after that uses a budget derived
 * from the previous table's own chain output — specifically, how much of
 * the page its last chunk consumed — rather than re-reading DOM that
 * doesn't yet reflect the pending split.
 */
function runSplitPass(view: EditorView, editor: { storage?: { PaginationPlus?: any } } | null): void {
  if (!view || view.isDestroyed) return
  const v = view
  const state = v.state
  const { schema } = state
  const tableType = schema.nodes.table
  if (!tableType) return

  const pageContentPx = readPageContentHeightPx(v, editor)
  if (pageContentPx == null) return

  interface TableEntry {
    pos: number
    node: PMNode
    measurements: RowMeasurement[]
  }
  const tables: TableEntry[] = []
  state.doc.descendants((node: PMNode, pos: number) => {
    if (node.type !== tableType) return true
    if (node.attrs.tablePageSplit === SPLIT_MARK) return true

    const domAt = v.nodeDOM(pos)
    if (!(domAt instanceof HTMLElement)) return true

    const measurements = measureRows(node, domAt)
    if (!measurements) return true

    tables.push({ pos, node, measurements })
    return true
  })

  if (tables.length === 0) return

  interface Pending {
    pos: number
    node: PMNode
    chain: PMNode[]
  }
  const pending: Pending[] = []

  // Cursor budget for the NEXT table to be processed. `null` means "use a
  // live-DOM read" (only valid for the first table); once we've committed
  // to analytical tracking, every subsequent table uses the cursor value.
  let cursorAvailablePx: number | null = null

  for (let i = 0; i < tables.length; i++) {
    const { pos, node, measurements } = tables[i]

    const availablePx = i === 0
      ? (availablePxAt(v, pos, pageContentPx) ?? pageContentPx)
      : (cursorAvailablePx ?? pageContentPx)

    const chain = buildSplitChain(node, measurements, availablePx, pageContentPx, schema, tableType, 0)
    if (chain.length > 1) pending.push({ pos, node, chain })

    // Advance the cursor for the NEXT table based on where this table's
    // last chunk leaves off. If this table didn't split at all, its whole
    // height was consumed from `availablePx`; the remainder is what's left
    // on the same page for whatever comes next. If it DID split, the last
    // chunk is a tail that started fresh at the top of a new page
    // (buildSplitChain's recursion), so the next table's budget is a fresh
    // full page minus that tail's actual height.
    const lastChunkPx = lastChunkHeightPx(measurements, availablePx, pageContentPx)
    if (lastChunkPx === null) {
      // No split — whole table consumed part of the current page.
      const totalPx = measurements[measurements.length - 1]?.cumulativePx ?? 0
      cursorAvailablePx = Math.max(0, availablePx - totalPx)
    } else {
      // Split — last chunk landed on a fresh page; carry forward what's left.
      cursorAvailablePx = Math.max(0, pageContentPx - lastChunkPx)
    }
  }

  if (pending.length === 0) return

  // Apply replacements in descending position order so earlier positions
  // remain valid after each replaceWith.
  const tr = state.tr
  pending.sort((a, b) => b.pos - a.pos)
  for (const { pos, node, chain } of pending) {
    tr.replaceWith(pos, pos + node.nodeSize, chain)
  }
  tr.setMeta(PLUGIN_KEY, { splitAtRow: -1 })
  v.dispatch(tr)
}

const TablePageSplitExtension = Extension.create({
  name: 'tablePageSplit',

  addProseMirrorPlugins() {
    let viewRef: EditorView | null = null
    let pendingRun = false
    const ext = this as unknown as { editor?: { storage: { PaginationPlus?: any } } }
    const editorRef: { storage: { PaginationPlus?: any } } | null = ext.editor ?? null

    return [
      new Plugin({
        key: PLUGIN_KEY,

        view(_editorView) {
          viewRef = _editorView
          return {
            destroy() {
              viewRef = null
            },
          }
        },

        appendTransaction(transactions, _oldState, _newState) {
          // Skip pagination's own layout syncs.
          if (transactions.some(t => t.getMeta('PAGE_COUNT_META_KEY') !== undefined)) {
            return null
          }
          // Skip our own split trs — the deferred microtask handles them.
          if (transactions.some(t => {
            const m = t.getMeta(PLUGIN_KEY) as { splitAtRow?: number } | undefined
            return m !== undefined && m.splitAtRow !== undefined
          })) return null
          if (!viewRef || viewRef.isDestroyed) return null

          // Coalesce: if a pass is already queued, don't queue another. The
          // queued pass walks the *latest* state, so multiple dispatches in
          // one user action (e.g. paste may internally dispatch several)
          // produce one split run, not one per dispatch.
          if (pendingRun) return null
          pendingRun = true

          queueMicrotask(() => {
            pendingRun = false
            if (!viewRef || viewRef.isDestroyed) return
            runSplitPass(viewRef, editorRef)
          })

          return null
        },
      }),
    ]
  },
})

export const tablePageSplitPlugin = definePlugin({
  id: 'tablePageSplit',
  tiptapExtensions: [TablePageSplitExtension],
})
