import { watch, type Ref } from 'vue'
import type { DocsEditor } from '@kedata-indonesia/docflow-core'

export interface PageMargins {
  top: number
  bottom: number
  left: number
  right: number
}

export interface ResolvedLayoutOptions {
  pageHeight: number
  pageWidth: number
  margins: PageMargins
}

export interface PaginationOptionsSnapshot {
  /** Subset of the component's `paginationOptions` computed that this composable
   *  reads and writes back into `editor.storage.PaginationPlus`. */
  enabled: boolean
  pageHeight: number
  pageWidth: number
  marginTop: number
  marginBottom: number
  marginLeft: number
  marginRight: number
  pageGap: number
  contentMarginTop: number
  contentMarginBottom: number
  pageBreakBackground: string
}

export interface UsePageStatsOptions {
  editor: Ref<DocsEditor['editor'] | null>
  isReady: Ref<boolean>
  resolvedLayoutOptions: Ref<ResolvedLayoutOptions>
  isPageless: Ref<boolean>
  paginationOptions: Ref<PaginationOptionsSnapshot>
  pageCount: Ref<number>
  currentPage: Ref<number>
  /** Footnotes composable is created after this one; read it lazily. */
  getUpdateFootnotes: () => void
  /** `props.pageless` is read lazily so prop changes stay reactive. */
  getPagelessProp: () => boolean | undefined
  emit: (event: 'update:pageless', pageless: boolean) => void
}

/**
 * Derived page statistics (page/current-page) plus the two layout side-effects
 * that keep PaginationPlus storage in sync: `applyPageless` (view-state toggle)
 * and the margins/page-size/orientation watcher. The ProseMirror document is
 * never mutated — only extension storage and CSS-driven decorations change.
 */
export function usePageStats(options: UsePageStatsOptions) {
  const {
    editor,
    isReady,
    resolvedLayoutOptions,
    isPageless,
    paginationOptions,
    pageCount,
    currentPage,
    getUpdateFootnotes,
    getPagelessProp,
    emit,
  } = options

  const updatePageStats = () => {
    if (!editor.value || !isReady.value) {
      pageCount.value = 1
      currentPage.value = 1
      return
    }

    const editorDom = editor.value.view.dom
    const paginationElement = editorDom.querySelector("[data-rm-pagination]")
    if (paginationElement) {
      pageCount.value = paginationElement.children.length || 1
    } else {
      pageCount.value = 1
    }

    try {
      const { selection } = editor.value.state
      const coords = editor.value.view.coordsAtPos(selection.head)
      if (coords && paginationElement) {
        const pageBreaks = Array.from(paginationElement.querySelectorAll(".rm-page-break"))
        const editorRect = editorDom.getBoundingClientRect()
        const selectionTopRelativeToEditor = coords.top - editorRect.top + editorDom.scrollTop

        let pageIndex = 1
        let found = false
        for (let i = 0; i < pageBreaks.length; i++) {
          const breaker = pageBreaks[i].querySelector(".breaker")
          if (breaker instanceof HTMLElement) {
            if (selectionTopRelativeToEditor < breaker.offsetTop) {
              currentPage.value = pageIndex
              found = true
              break
            }
          }
          pageIndex++
        }
        if (!found) {
          currentPage.value = pageIndex
        }
      } else {
        currentPage.value = 1
      }
    } catch {
      currentPage.value = 1
    }
  }

  watch(resolvedLayoutOptions, (newOptions) => {
    if (!editor.value) return
    
    editor.value.commands.updatePageHeight(newOptions.pageHeight)
    editor.value.commands.updatePageWidth(newOptions.pageWidth)
    editor.value.commands.updateMargins({
      top: newOptions.margins.top,
      bottom: newOptions.margins.bottom,
      left: newOptions.margins.left,
      right: newOptions.margins.right,
    })
    
    updatePageStats()
  })

  /**
   * Switch between paginated (paper) and pageless (continuous) layout.
   * Pageless is view state, not document content: we only flip the pagination
   * extension's runtime `enabled` flag — the ProseMirror document is never
   * touched, so switching back and forth preserves content exactly and is
   * safe in collaborative sessions (nothing flows into Yjs).
   */
  const applyPageless = (next: boolean) => {
    if (next === isPageless.value) return
    isPageless.value = next
    emit('update:pageless', next)
    if (!editor.value) return
    if (next) {
      editor.value.commands.disablePagination()
    } else {
      editor.value.commands.enablePagination()
    }
    // Page-break decorations are rebuilt asynchronously by the pagination
    // plugin's view hook — refresh derived stats and footnotes after the
    // DOM settles.
    setTimeout(() => {
      updatePageStats()
      getUpdateFootnotes()
    }, 60)
  }

  watch(
    () => getPagelessProp(),
    (next) => applyPageless(next ?? false),
  )

  // Reactively sync layout changes (margins, page size, orientation) to the
  // PaginationPlus extension storage so decoration rebuilds use current values.
  watch(paginationOptions, (opts) => {
    if (!editor.value || !isReady.value) return
    const storage = editor.value.storage.PaginationPlus
    if (!storage) return

    // Sync page dimensions & margins
    const changed =
      storage.pageHeight !== opts.pageHeight ||
      storage.pageWidth !== opts.pageWidth ||
      storage.marginTop !== opts.marginTop ||
      storage.marginBottom !== opts.marginBottom ||
      storage.marginLeft !== opts.marginLeft ||
      storage.marginRight !== opts.marginRight ||
      storage.pageGap !== opts.pageGap ||
      storage.contentMarginTop !== opts.contentMarginTop ||
      storage.contentMarginBottom !== opts.contentMarginBottom ||
      storage.pageBreakBackground !== opts.pageBreakBackground ||
      storage.enabled !== opts.enabled

    if (!changed) return

    storage.pageHeight = opts.pageHeight
    storage.pageWidth = opts.pageWidth
    storage.marginTop = opts.marginTop
    storage.marginBottom = opts.marginBottom
    storage.marginLeft = opts.marginLeft
    storage.marginRight = opts.marginRight
    storage.pageGap = opts.pageGap
    storage.contentMarginTop = opts.contentMarginTop
    storage.contentMarginBottom = opts.contentMarginBottom
    storage.pageBreakBackground = opts.pageBreakBackground
    storage.enabled = opts.enabled

    // Dispatch empty transaction to trigger decoration rebuild
    editor.value.view.dispatch(editor.value.state.tr)
  }, { deep: true })

  return {
    updatePageStats,
    applyPageless,
  }
}
