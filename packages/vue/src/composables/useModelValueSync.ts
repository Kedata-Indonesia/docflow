import { watch } from 'vue'
import type { DocsEditor } from '@kedata-indonesia/docflow-core'
import type { HeaderFooterValues } from './useDocumentModel.js'

export interface ModelValueApplication {
  /** Content the editor should show after the model was applied. */
  content?: object
  /** Header/footer slots carried by a tabbed document, if any. */
  headerFooter?: HeaderFooterValues
}

export interface UseModelValueSyncOptions {
  /** Host value; the sync runs whenever it changes after mount. */
  getModelValue: () => object | string | undefined
  getEditor: () => DocsEditor['editor'] | null
  /** Yjs owns the document in collaboration mode. */
  isCollaborative: () => boolean
  /** The last document this component emitted, used to ignore `v-model` echoes. */
  getLastEmitted: () => object | null
  /** Replace the tab state and return what the editor must show. */
  applyModelValue: (value: unknown) => ModelValueApplication
  /** Paint the header/footer slots carried by a tabbed document. */
  applyHeaderFooter?: (values: HeaderFooterValues) => void
  /** Recompute derived counters after the document was replaced. */
  onApplied?: () => void
}

/** JSON view used only to decide whether two documents are equivalent. */
const serialize = (value: unknown): string | null => {
  try {
    return JSON.stringify(value) ?? null
  } catch {
    return null
  }
}

/**
 * Applies host writes to `modelValue` after mount (issue #370): the prop is
 * the host's source of truth, so a rewrite — snapshot restore, document
 * switch, web-component `content` — must reach the editor.
 *
 * Two guards keep this from fighting the editor:
 * - the component's own emissions are skipped, so a `v-model` round-trip of
 *   what the editor just produced cannot reset the selection;
 * - collaboration mode is skipped entirely, because the Yjs document is
 *   authoritative there.
 */
export function useModelValueSync(options: UseModelValueSyncOptions) {
  watch(options.getModelValue, (value) => {
    if (value === undefined || value === null) return
    if (options.isCollaborative()) return

    const emitted = options.getLastEmitted()
    if (emitted && (emitted === value || serialize(emitted) === serialize(value))) return

    const { content, headerFooter } = options.applyModelValue(value)

    // A write that lands before the editor mounts still updates the model; the
    // editor then initialises from the latest active-tab content.
    const editor = options.getEditor()
    if (!editor) return

    if (headerFooter) options.applyHeaderFooter?.(headerFooter)
    if (content !== undefined && serialize(content) !== serialize(editor.getJSON())) {
      editor.commands.setContent(content, { emitUpdate: false })
    }
    options.onApplied?.()
  })
}
