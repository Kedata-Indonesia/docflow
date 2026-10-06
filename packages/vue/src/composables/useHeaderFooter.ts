import { ref, watch, type Ref } from 'vue'
import type { DocsEditor } from '@kedata-indonesia/docflow-core'
import { paintHeaderFooter } from './headerFooterPainter.js'

const HEADER_MARGIN_CM_MIN = 0
const HEADER_MARGIN_CM_MAX = 5
const HEADER_MARGIN_CM_STEP = 0.1

export interface HeaderFooterInitialContent {
  headerLeft: string
  headerRight: string
  footerLeft: string
  footerRight: string
}

/**
 * Page-numbering settings are owned by the component (they are part of its
 * observable surface); the composable reads them when resolving `{page}` and
 * writes them back when the page-number dialog is applied.
 */
export interface PageNumberSettings {
  position: Ref<'header' | 'footer'>
  showOnFirstPage: Ref<boolean>
  mode: Ref<'startAt' | 'continue'>
  startAt: Ref<number>
}

export interface UseHeaderFooterOptions {
  editor: Ref<DocsEditor['editor'] | null>
  isReady: Ref<boolean>
  pageCount: Ref<number>
  isDark: Ref<boolean>
  initialContent: HeaderFooterInitialContent
  headerMarginCmProp: Ref<number | undefined>
  footerMarginCmProp: Ref<number | undefined>
  pageNumber: PageNumberSettings
  persistCurrentDoc: () => void
  onUpdatePageCount: (pageCount: number) => void
  onUpdateHeaderFooterMargins: (margins: { headerMarginCm: number; footerMarginCm: number }) => void
}

/**
 * Header / footer content, margins and the three related dialogs (format,
 * page-number, footer text). All header/footer state is document-view state —
 * it is persisted through the injected `persistCurrentDoc` port and never
 * written into ProseMirror; only `applyHeaderFooter` imperatively paints the
 * generated PaginationPlus widgets.
 */
export function useHeaderFooter(options: UseHeaderFooterOptions) {
  const {
    editor,
    isReady,
    pageCount,
    isDark,
    initialContent,
    headerMarginCmProp,
    footerMarginCmProp,
    pageNumber,
    persistCurrentDoc,
    onUpdatePageCount,
    onUpdateHeaderFooterMargins,
  } = options

  function normalizeMarginCm(value: unknown, fallback = 0.5): number {
    const numericValue = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(numericValue)) return fallback
    const clamped = Math.min(HEADER_MARGIN_CM_MAX, Math.max(HEADER_MARGIN_CM_MIN, numericValue))
    return Math.round(clamped * 10) / 10
  }

  // ─── Header & footer content slots ─────────────────────────────────────────
  const userHeaderLeft = ref(initialContent.headerLeft)
  const userHeaderRight = ref(initialContent.headerRight)
  const userFooterLeft = ref(initialContent.footerLeft)
  const userFooterRight = ref(initialContent.footerRight)

  const isDifferentFirstPage = ref(false)
  const isDifferentOddEven = ref(false)
  const userFirstPageHeaderLeft = ref('')
  const userFirstPageHeaderRight = ref('')
  const userEvenPageHeaderLeft = ref('')
  const userEvenPageHeaderRight = ref('')

  const headerMarginCm = ref(normalizeMarginCm(headerMarginCmProp.value))
  const footerMarginCm = ref(normalizeMarginCm(footerMarginCmProp.value))

  // ─── Header format modal ───────────────────────────────────────────────────
  const showHeaderFormatModal = ref(false)
  const draftHeaderMarginCm = ref(headerMarginCm.value)
  const draftFooterMarginCm = ref(footerMarginCm.value)
  const draftDifferentFirstPage = ref(false)
  const draftDifferentOddEven = ref(false)

  // ─── Page number modal ─────────────────────────────────────────────────────
  const showPageNumberModal = ref(false)
  const draftPageNumberPosition = ref<'header' | 'footer'>('header')
  const draftShowPageNumberOnFirstPage = ref(true)
  const draftPageNumberMode = ref<'startAt' | 'continue'>('startAt')
  const draftPageNumberStartAt = ref(1)

  // ─── Footer text modal ─────────────────────────────────────────────────────
  const showFooterModal = ref(false)
  const footerLeftInput = ref('')
  const footerRightInput = ref('')

  const getResolvedPageNumber = (pageIndex: number) => {
    if (!pageNumber.showOnFirstPage.value && pageIndex === 0) return ''
    let num = pageIndex + 1
    if (pageNumber.mode.value === 'startAt') {
      num = pageIndex + pageNumber.startAt.value
    }
    return String(num)
  }

  const applyHeaderFooter = () => {
    paintHeaderFooter({
      editor,
      isReady,
      pageCount,
      headerMarginCm,
      footerMarginCm,
      userHeaderLeft,
      userHeaderRight,
      userFooterLeft,
      userFooterRight,
      isDifferentFirstPage,
      isDifferentOddEven,
      userFirstPageHeaderLeft,
      userFirstPageHeaderRight,
      userEvenPageHeaderLeft,
      userEvenPageHeaderRight,
      resolvePageNumber: getResolvedPageNumber,
    })
  }

  const openHeaderFormatModal = () => {
    draftHeaderMarginCm.value = headerMarginCm.value
    draftFooterMarginCm.value = footerMarginCm.value
    draftDifferentFirstPage.value = isDifferentFirstPage.value
    draftDifferentOddEven.value = isDifferentOddEven.value
    showHeaderFormatModal.value = true
  }

  const applyHeaderFormat = () => {
    headerMarginCm.value = normalizeMarginCm(draftHeaderMarginCm.value)
    footerMarginCm.value = normalizeMarginCm(draftFooterMarginCm.value)
    draftHeaderMarginCm.value = headerMarginCm.value
    draftFooterMarginCm.value = footerMarginCm.value
    isDifferentFirstPage.value = draftDifferentFirstPage.value
    isDifferentOddEven.value = draftDifferentOddEven.value
    showHeaderFormatModal.value = false
    applyHeaderFooter()
    onUpdateHeaderFooterMargins({
      headerMarginCm: headerMarginCm.value,
      footerMarginCm: footerMarginCm.value,
    })
    persistCurrentDoc()
  }

  const openPageNumberModal = () => {
    draftPageNumberPosition.value = pageNumber.position.value
    draftShowPageNumberOnFirstPage.value = pageNumber.showOnFirstPage.value
    draftPageNumberMode.value = pageNumber.mode.value
    draftPageNumberStartAt.value = pageNumber.startAt.value
    showPageNumberModal.value = true
  }

  const applyPageNumberSettings = () => {
    pageNumber.position.value = draftPageNumberPosition.value
    pageNumber.showOnFirstPage.value = draftShowPageNumberOnFirstPage.value
    pageNumber.mode.value = draftPageNumberMode.value
    pageNumber.startAt.value = draftPageNumberStartAt.value
    showPageNumberModal.value = false

    const pageToken = '{page}'

    if (pageNumber.position.value === 'footer') {
      // If moving page numbers to footer, clear page token from header
      if (userHeaderRight.value.includes(pageToken)) {
        userHeaderRight.value = userHeaderRight.value.replace(/{page}/g, '').trim()
      }
      userFooterRight.value = pageToken
    } else {
      // If moving page numbers to header, clear page token from footer
      if (userFooterRight.value.includes(pageToken)) {
        userFooterRight.value = userFooterRight.value.replace(/{page}/g, '').trim()
      }
      userHeaderRight.value = pageToken
    }

    applyHeaderFooter()
    persistCurrentDoc()
  }

  const openFooterModal = () => {
    if (!editor.value) return
    footerLeftInput.value = userFooterLeft.value || editor.value.storage.PaginationPlus?.appliedConfig?.footerLeft || ''
    footerRightInput.value = userFooterRight.value || editor.value.storage.PaginationPlus?.appliedConfig?.footerRight || ''
    showFooterModal.value = true
  }

  const saveFooter = () => {
    if (!editor.value) return
    userFooterLeft.value = footerLeftInput.value
    userFooterRight.value = footerRightInput.value

    applyHeaderFooter()
    persistCurrentDoc()

    showFooterModal.value = false
  }

  // ─── Reactive layout sync ──────────────────────────────────────────────────
  watch(isDifferentFirstPage, () => {
    applyHeaderFooter()
  })

  watch([
    isDifferentOddEven,
    headerMarginCm,
    footerMarginCm,
    pageNumber.position,
    pageNumber.showOnFirstPage,
    pageNumber.mode,
    pageNumber.startAt,
  ], () => {
    applyHeaderFooter()
  })

  watch(pageCount, (next) => {
    applyHeaderFooter()
    onUpdatePageCount(next)
  })

  watch(isDark, (darkVal) => {
    if (editor.value) {
      editor.value.commands.updatePageBreakBackground(darkVal ? '#02040a' : '#f1f5f9')
      // Dispatch transaction to trigger decoration rebuild with new background
      editor.value.view.dispatch(editor.value.state.tr)
    }
  })

  watch(headerMarginCmProp, (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) headerMarginCm.value = normalizeMarginCm(value)
  })

  watch(footerMarginCmProp, (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) footerMarginCm.value = normalizeMarginCm(value)
  })

  return {
    userHeaderLeft,
    userHeaderRight,
    userFooterLeft,
    userFooterRight,
    isDifferentFirstPage,
    isDifferentOddEven,
    userFirstPageHeaderLeft,
    userFirstPageHeaderRight,
    userEvenPageHeaderLeft,
    headerMarginCm,
    footerMarginCm,
    showHeaderFormatModal,
    draftHeaderMarginCm,
    draftFooterMarginCm,
    draftDifferentFirstPage,
    draftDifferentOddEven,
    showPageNumberModal,
    draftPageNumberPosition,
    draftShowPageNumberOnFirstPage,
    draftPageNumberMode,
    draftPageNumberStartAt,
    showFooterModal,
    footerLeftInput,
    footerRightInput,
    HEADER_MARGIN_CM_MIN,
    HEADER_MARGIN_CM_MAX,
    HEADER_MARGIN_CM_STEP,
    applyHeaderFooter,
    openHeaderFormatModal,
    applyHeaderFormat,
    openPageNumberModal,
    applyPageNumberSettings,
    openFooterModal,
    saveFooter,
  }
}
