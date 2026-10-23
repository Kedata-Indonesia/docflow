import { onUnmounted, watch } from 'vue'
import type { EditorOptions } from '@kedata-indonesia/docflow-core'
import { useEditorReady, type UseEditorReadyOptions } from './useEditorReady.js'
import type { useHeaderEdit } from './useHeaderEdit.js'
import type { useDocumentModel } from './useDocumentModel.js'

export interface UseDocsEditorBootstrapOptions extends UseEditorReadyOptions {
  finishHeaderEdit: ReturnType<typeof useHeaderEdit>['finishHeaderEdit']
  saveTimer: ReturnType<typeof useDocumentModel>['saveTimer']
  /** Emits a pending debounced document update immediately (#374). */
  flushPersist: ReturnType<typeof useDocumentModel>['flushPersist']
  /** Collaboration config is observed so prop swaps re-key the editor surface. */
  getCollaboration: () => EditorOptions['collaboration']
}

/**
 * Editor bootstrap + teardown: registers the ready hook that wires the
 * header/footer, link dialog, page stats and DOM listeners once the editor
 * instance exists, keeps the collaboration prop observed, flushes the pending
 * debounced document update on blur/unmount, and clears the pending
 * header-edit / persistence timers on unmount.
 */
export function useDocsEditorBootstrap(options: UseDocsEditorBootstrapOptions) {
  const {
    finishHeaderEdit, saveTimer, flushPersist, getCollaboration, isReady, editor, ...readyOptions
  } = options

  useEditorReady({ ...readyOptions, isReady, editor })

  watch(getCollaboration, () => {}, { deep: true })

  // Typing emissions are debounced; leaving the editing surface must not drop
  // the last edit. The listener is re-attached if the editor is re-created.
  watch(isReady, (ready, _previous, onCleanup) => {
    const dom = ready ? editor.value?.view.dom : null
    if (!dom) return
    const handleBlur = () => flushPersist()
    dom.addEventListener('blur', handleBlur)
    onCleanup(() => dom.removeEventListener('blur', handleBlur))
  }, { immediate: true })

  onUnmounted(() => {
    flushPersist()
    finishHeaderEdit(false)
    if (saveTimer.value) clearTimeout(saveTimer.value)
  })
}
