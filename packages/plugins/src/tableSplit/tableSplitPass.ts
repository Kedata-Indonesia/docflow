import type { EditorView } from '@tiptap/pm/view'
import type { Node as PMNode, NodeType } from '@tiptap/pm/model'
import { buildSplitChain } from './tableSplitChain.js'
import { availablePxAt, measureRows, readPageContentHeightPx } from './tableSplitMeasure.js'
import { lastChunkHeightPx, resolveHeadBudget } from './tableSplitRows.js'
import {
  PLUGIN_KEY,
  SPLIT_MARK,
  type EditorWithPaginationStorage,
  type RowMeasurement,
} from './tableSplitTypes.js'

interface TableEntry {
  pos: number
  node: PMNode
  measurements: RowMeasurement[]
}

interface PendingSplit {
  pos: number
  node: PMNode
  chain: PMNode[]
}

/** Collect every measurable, not-yet-split table in document order. */
function collectTables(view: EditorView, tableType: NodeType): TableEntry[] {
  const tables: TableEntry[] = []
  view.state.doc.descendants((node: PMNode, pos: number) => {
    if (node.type !== tableType) return true
    if (node.attrs.tablePageSplit === SPLIT_MARK) return true

    const domAt = view.nodeDOM(pos)
    if (!(domAt instanceof HTMLElement)) return true

    const measurements = measureRows(node, domAt)
    if (!measurements) return true

    tables.push({ pos, node, measurements })
    return true
  })
  return tables
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
export function runSplitPass(
  view: EditorView,
  editor: EditorWithPaginationStorage | null,
): void {
  if (!view || view.isDestroyed) return
  const v = view
  const state = v.state
  const { schema } = state
  const tableType = schema.nodes.table
  if (!tableType) return

  const pageContentPx = readPageContentHeightPx(v, editor)
  if (pageContentPx == null) return

  const tables = collectTables(v, tableType)
  if (tables.length === 0) return

  const pending: PendingSplit[] = []

  // Cursor budget for the NEXT table to be processed. `null` means "use a
  // live-DOM read" (only valid for the first table); once we've committed
  // to analytical tracking, every subsequent table uses the cursor value.
  let cursorAvailablePx: number | null = null

  for (let i = 0; i < tables.length; i++) {
    const { pos, node, measurements } = tables[i]

    const availablePx = i === 0
      ? (availablePxAt(v, pos, pageContentPx) ?? pageContentPx)
      : (cursorAvailablePx ?? pageContentPx)

    // The space the FIRST cut may use. A table that cannot fit even its first
    // row in `availablePx` starts on the next page instead (see
    // resolveHeadBudget) — otherwise it is left unsplit and PaginationPlus
    // inflates the page count around it (#163).
    const headBudgetPx = resolveHeadBudget(measurements, availablePx, pageContentPx)

    const chain = buildSplitChain(node, measurements, headBudgetPx, pageContentPx, tableType, 0)
    if (chain.length > 1) pending.push({ pos, node, chain })

    // Advance the cursor for the NEXT table based on where this table's
    // last chunk leaves off. If this table didn't split at all, its whole
    // height was consumed from `headBudgetPx`; the remainder is what's left
    // on the same page for whatever comes next. If it DID split, the last
    // chunk is a tail that started fresh at the top of a new page
    // (buildSplitChain's recursion), so the next table's budget is a fresh
    // full page minus that tail's actual height.
    const lastChunkPx = lastChunkHeightPx(measurements, headBudgetPx, pageContentPx)
    if (lastChunkPx === null) {
      // No split — whole table consumed part of the current page.
      const totalPx = measurements[measurements.length - 1]?.cumulativePx ?? 0
      cursorAvailablePx = Math.max(0, headBudgetPx - totalPx)
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
  // A split is a layout artifact, not a user edit, so it must not become an
  // undo step. If it did, Ctrl+Z would collapse the split back to the original
  // table and this plugin would immediately split it again — an undo that
  // visibly does nothing (and adds a history entry on every pass). Keeping the
  // split out of history means one undo reverses the user's real action (the
  // paste or cell edit); ProseMirror maps that inverse through the split, so
  // the chunk tables still disappear cleanly. `addToHistory` is honoured by
  // both StarterKit's history (non-collab) and y-prosemirror's undo (collab).
  // Decision: docs/plans/clipboard-paste-pipeline-plan.md §3, issue #25.
  tr.setMeta('addToHistory', false)
  v.dispatch(tr)
}
