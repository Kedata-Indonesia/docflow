import { definePlugin } from '@kedata-indonesia/docflow-core'
import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { runSplitPass } from './tableSplit/tableSplitPass.js'
import { PLUGIN_KEY, type EditorWithPaginationStorage } from './tableSplit/tableSplitTypes.js'

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
 *  - That split tr is dispatched with `addToHistory: false`: a split is a
 *    layout artifact, not a user edit, so undo must not reverse it (see
 *    `runSplitPass`).
 *
 * Measurement, chain building and the pass itself live in `tableSplit/`:
 * `tableSplitMeasure.ts` (page height + row heights), `tableSplitRows.ts`
 * (split row, head budget, cursor helpers), `tableSplitChain.ts` (the
 * recursive chunk builder) and `tableSplitPass.ts` (the deferred pass). This
 * file stays the plugin manifest.
 */

const TablePageSplitExtension = Extension.create({
  name: 'tablePageSplit',

  addProseMirrorPlugins() {
    let viewRef: EditorView | null = null
    let pendingRun = false
    const ext = this as unknown as { editor?: EditorWithPaginationStorage }
    const editorRef: EditorWithPaginationStorage | null = ext.editor ?? null

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
