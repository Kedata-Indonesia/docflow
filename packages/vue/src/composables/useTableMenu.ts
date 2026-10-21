import { ref, type Ref } from 'vue'
import type { Editor } from '@tiptap/core'

export interface TableMenuPosition {
  top: number
  left: number
}

export interface UseTableMenuOptions {
  editor: Ref<Editor | null>
  /** Visible editor viewport, used to keep the menu within the scroll area. */
  scrollContainerRef?: Ref<HTMLElement | null>
}

/**
 * Table edit-menu visibility + anchor position (issue #146). The menu is shown
 * whenever the caret/selection sits inside a table; its position is anchored to
 * the table's top edge and clamped to the visible editor viewport.
 */
export function useTableMenu(options: UseTableMenuOptions): {
  showTableMenu: Ref<boolean>
  tableMenuPosition: Ref<TableMenuPosition | null>
  updateTableMenu: () => void
} {
  const { editor, scrollContainerRef } = options
  const showTableMenu = ref(false)
  const tableMenuPosition = ref<TableMenuPosition | null>(null)

  const findTableElement = (): HTMLElement | null => {
    const ed = editor.value
    if (!ed) return null
    const { from } = ed.state.selection
    let node: Node | null = null
    try {
      node = ed.view.domAtPos(from).node
    } catch {
      return null
    }
    const el = node && node.nodeType === 1
      ? (node as HTMLElement)
      : (node?.parentElement ?? null)
    return (el?.closest('table') as HTMLElement | null) ?? null
  }

  const computePosition = (table: HTMLElement): TableMenuPosition | null => {
    if (typeof window === 'undefined') return null

    const tableRect = table.getBoundingClientRect()
    const scrollRect = scrollContainerRef?.value?.getBoundingClientRect?.() ?? null
    let scrollTop: number | null = null
    let scrollBottom: number | null = null
    if (scrollRect && scrollRect.bottom > scrollRect.top) {
      scrollTop = scrollRect.top
      scrollBottom = scrollRect.bottom
    }

    const margin = 8
    const menuHeight = 36
    // Conservative width used only for the horizontal clamp; the real bar is
    // content-sized and smaller than this in practice.
    const menuWidth = Math.min(560, tableRect.width || 560)

    const minTop = scrollTop !== null ? scrollTop + margin : margin
    const maxTop = scrollBottom !== null
      ? Math.max(minTop, scrollBottom - menuHeight)
      : Math.max(minTop, window.innerHeight - menuHeight)

    // Prefer sitting just above the table; fall back to just below its top
    // edge when there is no room above.
    let top = tableRect.top - menuHeight - margin
    if (top < minTop) top = tableRect.top + margin
    top = Math.min(Math.max(minTop, top), maxTop)

    const minLeft = margin
    const maxLeft = Math.max(minLeft, window.innerWidth - margin - menuWidth)
    const left = Math.min(Math.max(minLeft, tableRect.left), maxLeft)

    return { top, left }
  }

  const updateTableMenu = () => {
    const ed = editor.value
    if (!ed || !ed.isEditable || !ed.isActive('table')) {
      showTableMenu.value = false
      tableMenuPosition.value = null
      return
    }

    const table = findTableElement()
    if (!table) {
      showTableMenu.value = false
      tableMenuPosition.value = null
      return
    }

    const position = computePosition(table)
    tableMenuPosition.value = position
    showTableMenu.value = position !== null
  }

  return { showTableMenu, tableMenuPosition, updateTableMenu }
}
