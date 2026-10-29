import { onMounted, onUnmounted, type Ref } from 'vue'
import type { DocsEditor } from '@kedata-indonesia/docflow-core'
import { insertPastedImage, pickImageFile } from './pasteImage.js'

export interface UseEditKeyboardOptions {
  editor: Ref<DocsEditor['editor'] | null>
  focusMode: Ref<boolean>
  showFindReplace: Ref<boolean>
  /** ⌘⇧V — the plain-text paste handler owned by `useEditClipboard`. */
  pastePlain: () => Promise<void>
}

/**
 * Document-level edit shortcuts: ⌘⇧V pastes plain text (native in some
 * browsers; registered here for parity), ⌘⇧H opens find & replace (Google Docs
 * parity) and Escape leaves focus mode.
 */
export function useEditKeyboard(options: UseEditKeyboardOptions) {
  const { editor, focusMode, showFindReplace, pastePlain } = options

  const handleEditKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && focusMode.value) {
      focusMode.value = false
      return
    }
    if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return
    if (!editor.value?.view.dom.contains(e.target as Node)) return
    if (e.key.toLowerCase() === 'v') {
      e.preventDefault()
      void pastePlain()
    } else if (e.key.toLowerCase() === 'h') {
      e.preventDefault()
      showFindReplace.value = true
    }
  }

  // Ctrl/Cmd+V on an image-only clipboard would otherwise fall through to
  // ProseMirror's text/HTML paste path (and insert nothing). Capture on the
  // document so this runs before ProseMirror's own listener on the editor; leave
  // rich HTML alone so pasting a browser image keeps its surrounding markup.
  const handleNativePaste = (event: ClipboardEvent) => {
    const current = editor.value
    if (!current) return
    const target = event.target
    if (!(target instanceof Node) || !current.view.dom.contains(target)) return
    const data = event.clipboardData
    if (!data || Array.from(data.types).includes('text/html')) return
    const file = pickImageFile(data)
    if (!file) return
    event.preventDefault()
    event.stopPropagation()
    void insertPastedImage(current, file)
  }

  onMounted(() => {
    document.addEventListener('keydown', handleEditKeydown)
    document.addEventListener('paste', handleNativePaste, true)
  })
  onUnmounted(() => {
    document.removeEventListener('keydown', handleEditKeydown)
    document.removeEventListener('paste', handleNativePaste, true)
  })
}
