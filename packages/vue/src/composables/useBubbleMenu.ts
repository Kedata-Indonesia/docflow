import { ref, type Ref } from 'vue'
import type { DocsEditor } from '@kedata-indonesia/docflow-core'

export interface UseBubbleMenuOptions {
  editor: Ref<DocsEditor['editor'] | null>
}

/**
 * Floating bubble-menu visibility + viewport-clamped anchor position. The
 * position is derived purely from the ProseMirror selection and the window
 * metrics — it never touches the document.
 */
export function useBubbleMenu(options: UseBubbleMenuOptions) {
  const { editor } = options

  const showBubbleMenu = ref(false)
  const bubblePosition = ref<{ top: number; left: number } | null>(null)

  const computeBubblePosition = (): { top: number; left: number } | null => {
    if (!editor.value) return null
    const { from, to, head } = editor.value.state.selection
    if (from === to) return null
    const coords = editor.value.view.coordsAtPos(head)
    if (!coords) return null

    const viewportMargin = 12
    const estimatedMenuHalfWidth = 180
    const top = coords.top - 48
    const left = (coords.left + coords.right) / 2

    if (typeof window === 'undefined') {
      return { top: Math.max(viewportMargin, top), left }
    }

    const halfWidth = Math.min(
      estimatedMenuHalfWidth,
      Math.max(0, window.innerWidth / 2 - viewportMargin),
    )
    const minLeft = viewportMargin + halfWidth
    const maxLeft = window.innerWidth - viewportMargin - halfWidth
    const maxTop = Math.max(viewportMargin, window.innerHeight - 48)

    return {
      top: Math.min(maxTop, Math.max(viewportMargin, top)),
      left: Math.min(maxLeft, Math.max(minLeft, left)),
    }
  }

  const updateBubbleMenu = () => {
    if (!editor.value) { showBubbleMenu.value = false; bubblePosition.value = null; return }
    const { from, to } = editor.value.state.selection
    showBubbleMenu.value = from !== to
    bubblePosition.value = from !== to ? computeBubblePosition() : null
  }

  return {
    showBubbleMenu,
    bubblePosition,
    updateBubbleMenu,
    computeBubblePosition,
  }
}
