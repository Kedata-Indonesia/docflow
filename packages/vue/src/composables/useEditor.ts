import { createEditor, type DocsEditor, type EditorOptions } from '@kedata-indonesia/docflow-core'
import { computed, onMounted, onUnmounted, ref, shallowRef, watch, type ComputedRef, type Ref, type ShallowRef, nextTick, unref } from 'vue'

export type UseEditorOptions = Omit<EditorOptions, 'target' | 'content' | 'collaboration'> & {
  /** Plain value or ref — both are `unref`-ed at init. */
  content?: EditorOptions['content'] | Ref<EditorOptions['content']>
  collaboration?: EditorOptions['collaboration'] | Ref<EditorOptions['collaboration']>
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

  watch(
    () => {
      const collab = unref(options.collaboration)
      if (!collab) return null
      // A `CollaborationSetup` is an already-created instance (provider +
      // ydoc), not re-creatable config, so only `CollaborationOptions` can
      // drive a re-init. Narrowing this way also avoids stringifying the
      // provider object below.
      if (!('room' in collab)) return null
      return { room: collab.room, provider: collab.provider ?? null }
    },
    async (newVal, oldVal) => {
      if (JSON.stringify(newVal) !== JSON.stringify(oldVal)) {
        destroyEditor()
        await nextTick()
        initEditor()
      }
    },
    { deep: true }
  )

  return {
    editorRef,
    docsEditor,
    editor,
    pluginActions,
    isReady,
  }
}
