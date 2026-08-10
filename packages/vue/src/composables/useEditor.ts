import { createEditor, type DocsEditor, type EditorOptions } from '@kedata-indonesia/docflow-core'
import { computed, onMounted, onUnmounted, ref, shallowRef, watch, type ComputedRef, type Ref, type ShallowRef, nextTick, unref } from 'vue'

export interface UseEditorOptions extends Omit<EditorOptions, 'target' | 'onUpdate' | 'content' | 'collaboration'> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content?: any
  onUpdate?: (json: object) => void
  collaboration?: any
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

  watch(
    () => {
      const collab = unref(options.collaboration)
      return collab ? { room: collab.room, provider: collab.provider } : null
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
