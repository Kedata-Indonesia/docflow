import {
  createEditor,
  type CollaborationSetup,
  type DocsEditor,
  type EditorOptions,
} from '@kedata-indonesia/docflow-core'
import { computed, onMounted, onUnmounted, ref, shallowRef, watch, type ComputedRef, type Ref, type ShallowRef, nextTick, unref } from 'vue'

export interface UseEditorOptions extends Omit<EditorOptions, 'target' | 'onUpdate' | 'content' | 'collaboration'> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content?: any
  onUpdate?: (json: object) => void
  /**
   * Prebuilt collaboration setup (issue fe-aktifai#230). Raw
   * CollaborationOptions are intentionally not accepted — providers are
   * created via the async `createCollaboration()` by the host and passed in
   * as a ready `CollaborationSetup`. A `Ref`/computed is also accepted so
   * hosts can mount the editor immediately and bind collaboration when the
   * async setup resolves (the editor then rebuilds against it).
   */
  collaboration?: CollaborationSetup | Ref<CollaborationSetup | undefined>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  paginationOptions?: any
}

export interface UseEditorReturn {
  editorRef: Ref<HTMLDivElement | null>
  docsEditor: ShallowRef<DocsEditor | null>
  editor: ComputedRef<DocsEditor['editor'] | null>
  pluginActions: ComputedRef<DocsEditor['pluginActions']>
  isReady: Ref<boolean>
}

export function useEditor(options: UseEditorOptions): UseEditorReturn {
  const editorRef = ref<HTMLDivElement | null>(null)
  const docsEditor = shallowRef<DocsEditor | null>(null)
  const isReady = ref(false)

  const editor = computed(() => docsEditor.value?.editor ?? null)
  const pluginActions = computed(() => docsEditor.value?.pluginActions ?? {})

  const initEditor = () => {
    if (!editorRef.value || docsEditor.value) return

    const collabVal = unref(options.collaboration)
    const contentVal = unref(options.content)
    const nextEditor: DocsEditor = createEditor({
      target: editorRef.value,
      content: contentVal,
      plugins: options.plugins,
      editable: options.editable ?? true,
      collaboration: collabVal,
      onUpdate: options.onUpdate,
      getPageMap: options.getPageMap,
      paginationOptions: options.paginationOptions,
      onImageUpload: options.onImageUpload,
      citation: options.citation,
      aiStream: options.aiStream,
      aiDraft: options.aiDraft,
      debug: options.debug,
    })

    docsEditor.value = nextEditor

    nextTick(() => {
      isReady.value = true
    })
  }

  const destroyEditor = () => {
    docsEditor.value?.destroy()
    docsEditor.value = null
    isReady.value = false
  }

  onMounted(() => {
    initEditor()
  })

  onUnmounted(() => {
    destroyEditor()
  })

  watch(
    () => options.editable,
    (value) => {
      if (editor.value) {
        editor.value.setEditable(value ?? true)
      }
    },
  )

  // Rebuild the editor when the collaboration setup is swapped. Comparison is
  // on setup object identity (issue fe-aktifai#230): a CollaborationSetup is an
  // opaque, immutable-per-room object produced by the async
  // createCollaboration — a room/provider change always yields a *new* setup,
  // so deep-watching internals (room/provider fields) is unnecessary and was
  // fragile (JSON.stringify over a live provider instance can throw on
  // circular Yjs structures). When a plain (non-ref) setup is passed the
  // watcher never fires — mounting after `await createCollaboration` is the
  // supported alternative.
  watch(
    () => unref(options.collaboration),
    async (collab, prevCollab) => {
      if (collab !== prevCollab) {
        destroyEditor()
        await nextTick()
        initEditor()
      }
    },
  )

  return {
    editorRef,
    docsEditor,
    editor,
    pluginActions,
    isReady,
  }
}
