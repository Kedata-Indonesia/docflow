import { computed, ref, watch } from 'vue'
import { PAGE_SIZES, getPageSize } from '@kedata-indonesia/docflow-layout-engine'
import { useTheme } from './useTheme.js'

/** Page margins in CSS pixels, as consumed by the layout engine. */
export interface DocsEditorPageMargins {
  top: number
  bottom: number
  left: number
  right: number
}

export interface UseDocsEditorPageSurfaceOptions {
  getOrientation: () => 'portrait' | 'landscape' | undefined
  getMargins: () => DocsEditorPageMargins | undefined
  getPageSize: () => string | undefined
  getPageless: () => boolean | undefined
  getVirtualPages: () => boolean | undefined
  /**
   * Header/footer interactions live on a composable created after this one, and
   * are only reached from PaginationPlus click callbacks, so they are resolved
   * lazily instead of being captured eagerly.
   */
  getStartInlineHeaderEdit: () => (event?: MouseEvent) => void
  getOpenFooterModal: () => () => void
}

/**
 * Page geometry of the editor surface: reactive page size / orientation /
 * margins / pageless flag (seeded from the component props and kept in sync by
 * watchers), the derived layout options used by the paper frame and rulers, and
 * the PaginationPlus options handed to the editor.
 *
 * These refs stay the single source of truth for the rendered page; the
 * ProseMirror document is never mutated here.
 */
export function useDocsEditorPageSurface(options: UseDocsEditorPageSurfaceOptions) {
  const margins = ref<DocsEditorPageMargins>({
    top: options.getMargins()?.top ?? 94,
    bottom: options.getMargins()?.bottom ?? 94,
    left: options.getMargins()?.left ?? 94,
    right: options.getMargins()?.right ?? 94,
  })

  const orientation = ref<'portrait' | 'landscape'>(options.getOrientation() ?? 'portrait')

  const pageSizeId = ref(options.getPageSize() ?? 'a4')
  const isPageless = ref(options.getPageless() ?? false)

  // The prop wins over the internal status-bar state, so a host that persists the
  // page size gets a live re-layout instead of a stale paper until remount.
  watch(() => options.getPageSize(), (v) => {
    if (v !== undefined) pageSizeId.value = v
  })

  watch(() => options.getOrientation(), (v) => {
    if (v !== undefined) orientation.value = v
  })

  watch(() => options.getMargins(), (v) => {
    if (v !== undefined) margins.value = { ...v }
  })

  const resolvedLayoutOptions = computed(() => {
    const size = getPageSize(pageSizeId.value) ?? PAGE_SIZES[0]
    let w = size.pageWidth
    let h = size.pageHeight
    if (orientation.value === 'landscape') {
      ;[w, h] = [h, w]
    }
    return { pageHeight: h, pageWidth: w, margins: { ...margins.value } }
  })

  const paperMaxWidth = computed(() => `${resolvedLayoutOptions.value.pageWidth}px`)

  const { isDark } = useTheme()

  // Experimental: virtual page overlay flag. Must be defined early — referenced
  // by paginationOptions computed (below) to disable PaginationPlus when active.
  // Pageless wins: a pageless surface has no page frames to overlay.
  const useVirtual = computed(() => options.getVirtualPages() === true && !isPageless.value)

  const paginationOptions = computed(() => ({
    enabled: !isPageless.value && !useVirtual.value,
    pageHeight: resolvedLayoutOptions.value.pageHeight,
    pageWidth: resolvedLayoutOptions.value.pageWidth,
    marginTop: resolvedLayoutOptions.value.margins.top,
    marginBottom: resolvedLayoutOptions.value.margins.bottom,
    marginLeft: resolvedLayoutOptions.value.margins.left,
    marginRight: resolvedLayoutOptions.value.margins.right,
    contentMarginTop: 0,
    contentMarginBottom: 0,
    pageGap: 40,
    pageBreakBackground: isDark.value ? '#02040a' : '#f1f5f9',
    headerLeft: '',
    headerRight: '',
    footerLeft: '',
    footerRight: '',
    onHeaderClick: (params?: { event?: MouseEvent; pageNumber?: number }) => {
      options.getStartInlineHeaderEdit()(params?.event)
    },
    onFooterClick: (params?: { event?: MouseEvent; pageNumber?: number }) => {
      if (params?.event && params.event.detail !== 2) return
      options.getOpenFooterModal()()
    },
  }))

  return {
    margins,
    orientation,
    pageSizeId,
    isPageless,
    resolvedLayoutOptions,
    paperMaxWidth,
    isDark,
    useVirtual,
    paginationOptions,
  }
}
