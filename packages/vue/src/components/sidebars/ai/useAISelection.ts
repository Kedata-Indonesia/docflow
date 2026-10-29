import { computed, ref, watch } from 'vue'
import type { Editor } from '@tiptap/core'
import { toRawEditor } from './pmEditor.js'

/** How much document text is sent as context on either side of the selection. */
const CONTEXT_CAP = 1500

/**
 * Selection awareness for macros that need one. The editor DOM changes without
 * Vue knowing, so a transaction listener bumps a tick and the computed
 * re-reads `state.selection` — never the whole document.
 */
export function useAISelection(editorSource: () => Editor | null | undefined) {
  const selectionTick = ref(0)

  function handleTransaction(): void {
    selectionTick.value++
  }

  watch(
    editorSource,
    (next, previous) => {
      if (previous) toRawEditor(previous)?.off('transaction', handleTransaction)
      if (next) toRawEditor(next)?.on('transaction', handleTransaction)
    },
    { immediate: true },
  )

  const currentSelection = computed(() => {
    void selectionTick.value
    const state = toRawEditor(editorSource())?.state
    if (!state || state.selection.empty) return null
    const { from, to } = state.selection
    return { from, to, text: state.doc.textBetween(from, to, '\n', ' ') }
  })

  /** Bounded context around the selection (or cursor) — never the whole doc. */
  function boundedContext(): { before: string; after: string } | undefined {
    const state = toRawEditor(editorSource())?.state
    if (!state) return undefined
    const { from, to } = state.selection
    return {
      before: state.doc.textBetween(Math.max(0, from - CONTEXT_CAP), from, '\n', ' '),
      after: state.doc.textBetween(to, Math.min(state.doc.content.size, to + CONTEXT_CAP), '\n', ' '),
    }
  }

  return { currentSelection, boundedContext, handleTransaction }
}
