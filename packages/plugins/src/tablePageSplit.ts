import { definePlugin } from '@kedata-indonesia/docflow-core'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'

/**
 * Experimental plugin — splits a table node into multiple sibling tables at
 * page boundaries when its rendered height exceeds the page-content area, so a
 * tall pasted table no longer jumps wholesale to page 2 (leaving a blank band
 * on page 1).
 *
 * See docs/plans/clipboard-paste-pipeline-plan.md §9 "Remaining known issue"
 * for the underlying PaginationPlus limitation this addresses.
 *
 * Mechanism:
 *  - `appendTransaction` fires after every dispatch. We skip:
 *      * transactions carrying PaginationPlus's `PAGE_COUNT_META_KEY`
 *        (those are layout syncs, not edits);
 *      * transactions whose doc is identical to the input (no structural
 *        change);
 *      * transactions whose only effect was our own previous split (to
 *        avoid immediately re-splitting the same table).
 *  - When a real user edit (paste, typing, etc.) lands, we find the FIRST
 *    unsplit table, measure its rows against the page-content area, and
 *    split it into head + tail. We schedule ONE follow-up dispatch via
 *    `queueMicrotask` carrying `tpsFollowUp: true` so the tail can be
 *    re-measured and split again. We bound the recursion by tracking how
 *    many follow-ups we have dispatched in the last user-edit burst and
 *    stopping after `MAX_RECURSIVE_SPLITS` (default 16 — enough to handle
 *    a 200-row pasted table).
 *  - Requires the patched `tiptap-pagination-plus` in
 *    `patches/tiptap-pagination-plus@3.1.0.patch` to honor
 *    `data-tps-splittable` (tables marked by the plugin opt out of the
 *    convergence guard and PaginationPlus will grow the page count to fit
 *    them across pages).
 */

const PLUGIN_KEY = new PluginKey('docflow/table-page-split')
const SPLIT_MARK = 'head'
const MAX_RECURSIVE_SPLITS = 16
const RECURSIVE_BUDGET_RESET_MS = 100

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

const TablePageSplitExtension = Extension.create({
  name: 'tablePageSplit',

  addProseMirrorPlugins() {
    let view: EditorView | null = null
    const ext = this as unknown as { editor?: { storage: { PaginationPlus?: any } } }
    const editorRef = ext.editor ?? null
    let lastBurstAt = 0
    let burstSplits = 0

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
          // `tpsFollowUp` trs are dispatched by our companion plugin to
          // continue a split burst — let them through so we re-measure.

          if (!view) return null

          // Bound the recursion: each user-edit burst may split at most
          // MAX_RECURSIVE_SPLITS times before we go quiescent.
          const now = Date.now()
          if (now - lastBurstAt > RECURSIVE_BUDGET_RESET_MS) {
            burstSplits = 0
          }
          lastBurstAt = now
          if (burstSplits >= MAX_RECURSIVE_SPLITS) return null

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

          const splitRow = findSplitRow(measurements, pageContentPx)
          if (splitRow < 0) return null

          const content = tableNode.content
          let splitPos = 0
          tableNode.forEach((row, offset, index) => {
            if (index <= splitRow) splitPos = offset + row.nodeSize
          })
          const leftContent = content.cut(0, splitPos)
          const rightContent = content.cut(splitPos)

          const leftAttrs = { ...tableNode.attrs, tablePageSplit: SPLIT_MARK }
          const rightAttrs = { ...tableNode.attrs, tablePageSplit: null }

          const leftTable = tableType.create(leftAttrs, leftContent, tableNode.marks)
          const rightTable = tableType.create(rightAttrs, rightContent, tableNode.marks)
          const separator = schema.nodes.paragraph.create()

          const tr = newState.tr
          tr.replaceWith(tablePos, tablePos + tableNode.nodeSize, [leftTable, separator, rightTable])
          tr.setMeta(PLUGIN_KEY, { splitAtRow: splitRow })

          burstSplits += 1
          return tr
        },

        // After every dispatch that applies our tr, schedule ONE follow-up
        // so the next cycle re-measures the new tail.
        appendTransactionFromMetaHook: undefined as never,
      }),

      // Companion plugin: after each dispatch that carried our split meta,
      // fire a follow-up tr (asynchronously, outside the current cycle) so
      // the next cycle re-measures the new tail. We bind the burst size
      // in the main plugin's `burstSplits` counter.
      new Plugin({
        key: new PluginKey('docflow/table-page-split-followup'),
        appendTransaction(transactions, _oldState, _newState) {
          const hadSplit = transactions.some(t => {
            const m = t.getMeta(PLUGIN_KEY) as { splitAtRow?: number } | undefined
            return m !== undefined && m.splitAtRow !== undefined
          })
          if (!hadSplit) return null
          // Schedule the follow-up for *after* the current commit lands.
          // Doing it inline inside appendTransaction risks re-entrancy.
          const v = view
          setTimeout(() => {
            if (!v) return
            if (v.isDestroyed) return
            const t = v.state.tr.setMeta('tpsFollowUp', true)
            v.dispatch(t)
          }, 0)
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