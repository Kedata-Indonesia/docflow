import { onUnmounted, ref, watch, type Ref } from 'vue'
import type { DocsEditor } from '@kedata-indonesia/docflow-core'
import type { SuggestionSummary } from '../types.js'

export interface UseSuggestionsOptions {
  /** Read lazily — the editor is created after this composable. */
  getEditor: () => DocsEditor['editor'] | null
  isReady: Ref<boolean>
}

/**
 * Pending tracked-change suggestions (issues #27/#28, P2). Reads the live list
 * from `editor.storage.suggestChanges.suggestions` (synced by the plugin on
 * every transaction) and exposes accept/reject actions.
 */
export function useSuggestions(options: UseSuggestionsOptions) {
  const { getEditor, isReady } = options
  const suggestions = ref<SuggestionSummary[]>([])

  const readStorage = (): SuggestionSummary[] => {
    const storage = (getEditor()?.storage as Record<string, { suggestions?: SuggestionSummary[] }> | undefined)
      ?.suggestChanges
    return storage?.suggestions ? [...storage.suggestions] : []
  }

  const refresh = () => {
    suggestions.value = readStorage()
  }

  watch(isReady, (ready) => {
    const editor = getEditor()
    if (!ready || !editor) return
    refresh()
    editor.on('update', refresh)
  })

  const accept = (id: string) => {
    getEditor()?.commands.acceptSuggestion?.(id)
    refresh()
  }
  const reject = (id: string) => {
    getEditor()?.commands.rejectSuggestion?.(id)
    refresh()
  }
  const acceptAll = () => {
    getEditor()?.commands.acceptAllSuggestions?.()
    refresh()
  }
  const rejectAll = () => {
    getEditor()?.commands.rejectAllSuggestions?.()
    refresh()
  }

  onUnmounted(() => {
    getEditor()?.off?.('update', refresh)
  })

  return { suggestions, refresh, accept, reject, acceptAll, rejectAll }
}
