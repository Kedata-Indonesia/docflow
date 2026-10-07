import { onUnmounted, watch } from 'vue'
import type { EditorOptions } from '@kedata-indonesia/docflow-core'
import { useEditorReady, type UseEditorReadyOptions } from './useEditorReady.js'
import type { useHeaderEdit } from './useHeaderEdit.js'
import type { useDocumentModel } from './useDocumentModel.js'

export interface UseDocsEditorBootstrapOptions extends UseEditorReadyOptions {
  finishHeaderEdit: ReturnType<typeof useHeaderEdit>['finishHeaderEdit']
  saveTimer: ReturnType<typeof useDocumentModel>['saveTimer']
  /** Collaboration config is observed so prop swaps re-key the editor surface. */
  getCollaboration: () => EditorOptions['collaboration']
}

/**
 * Editor bootstrap + teardown: registers the ready hook that wires the
 * header/footer, link dialog, page stats and DOM listeners once the editor
 * instance exists, keeps the collaboration prop observed, and clears the
 * pending header-edit / persistence timers on unmount.
 */
export function useDocsEditorBootstrap(options: UseDocsEditorBootstrapOptions) {
  const { finishHeaderEdit, saveTimer, getCollaboration, ...readyOptions } = options

  useEditorReady(readyOptions)

  watch(getCollaboration, () => {}, { deep: true })
  onUnmounted(() => {
    finishHeaderEdit(false)
    if (saveTimer.value) clearTimeout(saveTimer.value)
  })
}
