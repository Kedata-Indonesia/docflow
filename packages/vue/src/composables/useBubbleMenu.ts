import { ref, type Ref } from 'vue'
import type { DocsEditor } from '@kedata-indonesia/docflow-core'

export interface UseBubbleMenuOptions {
  editor: Ref<DocsEditor['editor'] | null>
  /**
   * Visible editor viewport. Used to keep the floating menu below the editor
   * chrome and to hide it when the selection is scrolled out of view (#322).
   */
  scrollContainerRef?: Ref<HTMLElement | null>
}

/**
 * Floating bubble-menu visibility + viewport-clamped anchor position. The
 * position is derived purely from the ProseMirror selection and the window
 * metrics — it never touches the document.
 */
export function useBubbleMenu(options: UseBubbleMenuOptions) {
  const { editor, scrollContainerRef } = options

  const showBubbleMenu = ref(false)
  const bubblePosition = ref<{ top: number; left: number } | null>(null)

  const computeBubblePosition = (): { top: number; left: number } | null => {
    if (!editor.value) return null
    const { from, to, head } = editor.value.state.selection
    if (from === to) return null
    const coords = editor.value.view.coordsAtPos(head)
    if (!coords) return null

    const viewportMargin = 12
    const menuGap = 8
    const estimatedMenuHalfWidth = 180

    // The scroll container's rect defines the visible editor area. `null` when
    // there is no layout (SSR / a detached node), in which case we fall back to
    // the window viewport as before.
    const scrollRect = scrollContainerRef?.value?.getBoundingClientRect?.() ?? null
    let scrollTop: number | null = null
    let scrollBottom: number | null = null
    if (scrollRect && scrollRect.bottom > scrollRect.top) {
      scrollTop = scrollRect.top
      scrollBottom = scrollRect.bottom
    }

    // Selection endpoint scrolled out of the visible area: hide the menu rather
    // than pinning it to the window edge over the toolbar (#322).
    if (scrollTop !== null && scrollBottom !== null) {
      const endpointBottom = coords.bottom ?? coords.top
      if (endpointBottom < scrollTop || coords.top > scrollBottom) return null
    }

    const left = (coords.left + coords.right) / 2
    const top = coords.top - 48

    if (typeof window === 'undefined') {
      return { top: Math.max(viewportMargin, top), left }
    }

    // Never place the menu above the editor viewport (it would cover the
    // toolbar / host chrome). This is the fix for #322.
    const minTop = scrollTop !== null
      ? Math.max(viewportMargin, scrollTop + menuGap)
      : viewportMargin
    const halfWidth = Math.min(
      estimatedMenuHalfWidth,
      Math.max(0, window.innerWidth / 2 - viewportMargin),
    )
    const minLeft = viewportMargin + halfWidth
    const maxLeft = window.innerWidth - viewportMargin - halfWidth
    const viewportMaxTop = Math.max(minTop, window.innerHeight - 48)
    const maxTop = scrollBottom !== null
      ? Math.max(minTop, Math.min(viewportMaxTop, scrollBottom - 48))
      : viewportMaxTop

    return {
      top: Math.min(maxTop, Math.max(minTop, top)),
      left: Math.min(maxLeft, Math.max(minLeft, left)),
    }
  }

  const updateBubbleMenu = () => {
    if (!editor.value) { showBubbleMenu.value = false; bubblePosition.value = null; return }
    const { from, to } = editor.value.state.selection
    if (from === to) {
      showBubbleMenu.value = false
      bubblePosition.value = null
      return
    }
    const position = computeBubblePosition()
    bubblePosition.value = position
    // `null` means the selection is outside the visible scroll area (#322).
    showBubbleMenu.value = position !== null
  }

  return {
    showBubbleMenu,
    bubblePosition,
    updateBubbleMenu,
    computeBubblePosition,
  }
}
