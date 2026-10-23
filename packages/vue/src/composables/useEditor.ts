import { createEditor, type DocsEditor, type EditorOptions } from '@kedata-indonesia/docflow-core'
import {
  computed, nextTick, onMounted, onUnmounted, ref, shallowRef, toRaw, unref, watch,
  type ComputedRef, type Ref, type ShallowRef,
} from 'vue'

export type UseEditorOptions = Omit<EditorOptions, 'target' | 'content' | 'collaboration' | 'editable'> & {
  /**
   * Plain value or ref — `unref`-ed at init, then watched so a host write
   * replaces the document without a remount. Ignored in collaboration mode,
   * where Yjs is authoritative.
   */
  content?: EditorOptions['content'] | Ref<EditorOptions['content']>
  collaboration?: EditorOptions['collaboration'] | Ref<EditorOptions['collaboration']>
  /**
   * Plain value or ref — `unref`-ed at init, then watched, so a live toggle
   * (e.g. `<DocsEditor :editable="flag">`) reaches `editor.setEditable()`
   * instead of being frozen into the editor at mount time.
   */
  editable?: boolean | Ref<boolean>
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

  /**
   * The last document the editor reported through `onUpdate`. When the content
   * ref is fed back (the host's `v-model` write), the reference matches and the
   * watcher below skips `setContent`, so the editor never loops on itself.
   */
  let lastEmittedContent: unknown = null

  /** Compare unwrapped documents: Vite/Vue refs hand back reactive proxies. */
  const isSameContent = (a: unknown, b: unknown): boolean => toRaw(a) === toRaw(b)

  const initEditor = () => {
    if (!editorRef.value || docsEditor.value) return

    const collabVal = unref(options.collaboration)
    const contentVal = unref(options.content)
    const nextEditor: DocsEditor = createEditor({
      target: editorRef.value,
      content: contentVal,
      plugins: options.plugins,
      editable: unref(options.editable) ?? true,
      collaboration: collabVal,
      onUpdate: (json) => {
        lastEmittedContent = toRaw(json)
        options.onUpdate?.(json)
      },
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
    () => unref(options.editable),
    (value) => {
      if (editor.value) {
        editor.value.setEditable(value ?? true)
      }
    },
  )

  // Host-driven content replacement after mount (version-history restore,
  // document switching, web-component `content` rewrite). `emitUpdate: false`
  // keeps the replacement out of the persistence pipeline; collaboration mode
  // is skipped because Yjs owns the document there.
  watch(
    () => unref(options.content),
    (value) => {
      if (value === undefined || isSameContent(value, lastEmittedContent)) return
      if (unref(options.collaboration)) return
      if (!editor.value) return
      lastEmittedContent = toRaw(value)
      editor.value.commands.setContent(value, { emitUpdate: false })
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
