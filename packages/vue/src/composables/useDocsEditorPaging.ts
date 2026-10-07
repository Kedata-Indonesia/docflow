import { computed, watch, type EmitFn, type Ref } from 'vue'
import type { DocsEditor } from '@kedata-indonesia/docflow-core'
import type { DocsEditorEmits } from '../components/docsEditorContracts.js'
import type { DocsEditorPageMargins } from './useDocsEditorPageSurface.js'
import { usePageSetup } from './usePageSetup.js'
import { useVirtualPages } from './useVirtualPages.js'
import { usePageStats, type PaginationOptionsSnapshot, type ResolvedLayoutOptions } from './usePageStats.js'

export interface UseDocsEditorPagingOptions {
  emit: EmitFn<DocsEditorEmits>
  pageSizeId: Ref<string>
  orientation: Ref<'portrait' | 'landscape'>
  margins: Ref<DocsEditorPageMargins>
  resolvedLayoutOptions: Ref<ResolvedLayoutOptions>
  useVirtual: Ref<boolean>
  paginationOptions: Ref<PaginationOptionsSnapshot>
  isPageless: Ref<boolean>
  pageCount: Ref<number>
  currentPage: Ref<number>
  editor: Ref<DocsEditor['editor'] | null>
  isReady: Ref<boolean>
  scrollContainerRef: Ref<HTMLElement | null>
  userHeaderLeft: Ref<string>
  userHeaderRight: Ref<string>
  userFooterLeft: Ref<string>
  userFooterRight: Ref<string>
  /** Footnotes composable is created after this one; read it lazily. */
  getUpdateFootnotes: () => void
  /** `pageless` is read lazily so prop changes stay reactive. */
  getPagelessProp: () => boolean | undefined
}

/**
 * Page management: the page-setup dialog, the experimental virtual-page overlay
 * and the derived page statistics (`pageCount` / `currentPage`).
 *
 * The two layout side-effects that keep PaginationPlus storage in sync live in
 * `usePageStats`; the ProseMirror document itself is never mutated here.
 */
export function useDocsEditorPaging(options: UseDocsEditorPagingOptions) {
  const {
    emit, pageSizeId, orientation, margins, resolvedLayoutOptions, useVirtual, paginationOptions, isPageless,
    pageCount, currentPage, editor, isReady, scrollContainerRef, userHeaderLeft, userHeaderRight,
    userFooterLeft, userFooterRight, getUpdateFootnotes, getPagelessProp,
  } = options

  // ─── Page Setup ──────────────────────────────────────────────────────────────
  const {
    showPageSetupModal, pageSetupSize, pageSetupOrientation, pageSetupMarginsCm, PAGE_MARGIN_CM_MIN,
    PAGE_MARGIN_CM_MAX, openPageSetupModal, applyPageSetup,
  } = usePageSetup({
    pageSizeId,
    orientation,
    margins,
    onUpdatePageSize: (value) => emit('update:pageSize', value),
    onUpdateOrientation: (value) => emit('update:orientation', value),
    onUpdateMargins: (value) => emit('update:margins', value),
  })

  // ─── Virtual Pages (experimental) ────────────────────────────────────────────
  const virtualConfig = computed(() => {
    const lo = resolvedLayoutOptions.value
    return {
      pageSize: {
        id: pageSizeId.value, name: pageSizeId.value.toUpperCase(),
        pageWidth: lo.pageWidth, pageHeight: lo.pageHeight,
      },
      margins: { top: lo.margins.top, bottom: lo.margins.bottom, left: lo.margins.left, right: lo.margins.right },
      pageGap: 40,
      headerLeft: userHeaderLeft.value,
      headerRight: userHeaderRight.value,
      footerLeft: userFooterLeft.value,
      footerRight: userFooterRight.value,
    }
  })

  const {
    data: virtualData,
    totalPages: virtualTotalPages,
    isReady: virtualReady,
    refreshData: refreshVirtual,
  } = useVirtualPages({
    editorRef: computed(() => editor.value as { view: { dom: HTMLElement } } | null),
    scrollRef: scrollContainerRef,
    // The computed itself (not `.value`) so the overlay follows live page size
    // and margin changes instead of freezing the mount-time snapshot.
    config: virtualConfig,
    bufferPages: 2,
  })

  watch([virtualTotalPages, virtualReady], () => {
    if (useVirtual.value && virtualReady.value) {
      pageCount.value = virtualTotalPages.value
    }
  })

  watch(useVirtual, (enabled) => {
    if (enabled) {
      // When virtual pages toggle on, re-measure
      refreshVirtual()
    }
  })

  const { updatePageStats, applyPageless } = usePageStats({
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
  })

  return {
    showPageSetupModal, pageSetupSize, pageSetupOrientation, pageSetupMarginsCm, PAGE_MARGIN_CM_MIN,
    PAGE_MARGIN_CM_MAX, openPageSetupModal, applyPageSetup, virtualData, virtualReady, updatePageStats,
    applyPageless,
  }
}
