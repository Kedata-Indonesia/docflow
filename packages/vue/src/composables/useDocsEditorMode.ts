import { computed, ref, watch, type Ref } from 'vue'
import type { Editor } from '@tiptap/core'
import type { DocumentMode, DocsEditorPlugin } from '@kedata-indonesia/docflow-core'

export interface UseDocsEditorModeOptions {
  getMode: () => DocumentMode | undefined
  getEditable: () => boolean | undefined
  getPlugins: () => DocsEditorPlugin[] | undefined
  emitMode: (mode: DocumentMode) => void
}

/**
 * Document mode state (issues #27/#28).
 *
 * Controlled: an explicit `mode` prop wins. Uncontrolled: the View ▸ Document
 * mode menu drives internal state, so the menu works even when the host does
 * not bind `v-model:mode`. `editable === false` maps to `viewing` for backwards
 * compatibility.
 *
 * Pure state only — it must be creatable before the editor session exists (the
 * session consumes `effectiveEditable`). The plugin sync that needs the editor
 * lives in `useDocsEditorSuggestSync`.
 */
export function useDocsEditorMode(options: UseDocsEditorModeOptions) {
  const internalMode = ref<DocumentMode>('editing')

  const documentMode = computed<DocumentMode>(
    () => options.getMode()
      ?? (options.getEditable() === false ? 'viewing' : internalMode.value),
  )

  const effectiveEditable = computed(() =>
    documentMode.value === 'viewing' ? false : (options.getEditable() ?? true),
  )

  // Insert ▸ Bibliography is only meaningful when the citation plugin (which
  // registers the node + insertBibliography command) is part of the plugin set.
  const hasCitationPlugin = computed(
    () => options.getPlugins()?.some((plugin) => plugin.id === 'citation') ?? false,
  )

  const setDocumentMode = (mode: DocumentMode) => {
    internalMode.value = mode
    options.emitMode(mode)
  }

  return { documentMode, effectiveEditable, hasCitationPlugin, setDocumentMode }
}

export interface UseDocsEditorSuggestSyncOptions {
  isReady: Ref<boolean>
  getDocumentMode: () => DocumentMode
  getEditor: () => Editor | null | undefined
  getUserName: () => string | undefined
}

/**
 * Push the mode + author into the suggestChanges plugin (issues #27/#28). The
 * plugin is inert in `editing` mode, so this is a no-op for existing hosts.
 *
 * Call after `useDocsEditorSession` — the watch sources read `isReady` eagerly.
 */
export function useDocsEditorSuggestSync(options: UseDocsEditorSuggestSyncOptions): void {
  watch([options.isReady, options.getDocumentMode], ([ready, mode]) => {
    if (!ready) return
    options.getEditor()?.commands.setDocumentMode?.(mode)
  })

  watch([options.isReady, options.getUserName], ([ready, name]) => {
    if (!ready) return
    options.getEditor()?.commands.setSuggestionAuthor?.({ name: name ?? null })
  })
}
