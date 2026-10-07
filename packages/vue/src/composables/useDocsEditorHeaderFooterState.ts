import { computed, type EmitFn, type Ref } from 'vue'
import type { DocsEditor } from '@kedata-indonesia/docflow-core'
import type { DocsEditorEmits } from '../components/docsEditorContracts.js'
import type { LocaleContext } from './useLocale.js'
import { useHeaderFooter, type PageNumberSettings } from './useHeaderFooter.js'
import { useHeaderEdit } from './useHeaderEdit.js'
import type { useDocumentModel } from './useDocumentModel.js'

export interface UseDocsEditorHeaderFooterStateOptions {
  editor: Ref<DocsEditor['editor'] | null>
  isReady: Ref<boolean>
  pageCount: Ref<number>
  isDark: Ref<boolean>
  /** Initial header/footer slots from the persisted document. */
  initialDoc: ReturnType<typeof useDocumentModel>['initialDoc']
  persistCurrentDoc: () => void
  emit: EmitFn<DocsEditorEmits>
  scrollContainerRef: Ref<HTMLElement | null>
  t: LocaleContext['t']
  getHeaderMarginCm: () => number | undefined
  getFooterMarginCm: () => number | undefined
  /** Page-number settings are owned by the component; passed in as refs. */
  pageNumber: PageNumberSettings
}

/**
 * Header / footer state: the header/footer slot refs, margins, the three
 * related dialogs (format, page-number, footer text) and inline header editing.
 *
 * All of it is document-view state — it is persisted through the injected
 * `persistCurrentDoc` port and never written into ProseMirror; only
 * `applyHeaderFooter` imperatively paints the generated PaginationPlus widgets.
 */
export function useDocsEditorHeaderFooterState(options: UseDocsEditorHeaderFooterStateOptions) {
  const {
    editor, isReady, pageCount, isDark, initialDoc, persistCurrentDoc, emit, scrollContainerRef, t,
    getHeaderMarginCm, getFooterMarginCm, pageNumber,
  } = options

  const {
    userHeaderLeft, userHeaderRight, userFooterLeft, userFooterRight, isDifferentFirstPage, isDifferentOddEven,
    userFirstPageHeaderLeft, userFirstPageHeaderRight, userEvenPageHeaderLeft, headerMarginCm, footerMarginCm,
    showHeaderFormatModal, draftHeaderMarginCm, draftFooterMarginCm, draftDifferentFirstPage, draftDifferentOddEven,
    showPageNumberModal, draftPageNumberPosition, draftShowPageNumberOnFirstPage, draftPageNumberMode,
    draftPageNumberStartAt, showFooterModal, footerLeftInput, footerRightInput, HEADER_MARGIN_CM_MIN,
    HEADER_MARGIN_CM_MAX, HEADER_MARGIN_CM_STEP, applyHeaderFooter, openHeaderFormatModal, applyHeaderFormat,
    openPageNumberModal, applyPageNumberSettings, openFooterModal, saveFooter,
  } = useHeaderFooter({
    editor,
    isReady,
    pageCount,
    isDark,
    initialContent: {
      headerLeft: initialDoc.headerLeft ?? '',
      headerRight: initialDoc.headerRight ?? '',
      footerLeft: initialDoc.footerLeft ?? '',
      footerRight: initialDoc.footerRight ?? '',
    },
    headerMarginCmProp: computed(() => getHeaderMarginCm()),
    footerMarginCmProp: computed(() => getFooterMarginCm()),
    pageNumber,
    persistCurrentDoc,
    onUpdatePageCount: (value) => emit('update:pageCount', value),
    onUpdateHeaderFooterMargins: (value) => emit('update:header-footer-margins', value),
  })

  const { startInlineHeaderEdit, finishHeaderEdit } = useHeaderEdit({
    editor,
    scrollContainerRef,
    t,
    isDifferentFirstPage,
    isDifferentOddEven,
    userHeaderLeft,
    userHeaderRight,
    userFirstPageHeaderLeft,
    userFirstPageHeaderRight,
    userEvenPageHeaderLeft,
    applyHeaderFooter,
    persistCurrentDoc,
    openHeaderFormatModal,
    openPageNumberModal,
  })

  return {
    userHeaderLeft, userHeaderRight, userFooterLeft, userFooterRight, isDifferentFirstPage, isDifferentOddEven,
    userFirstPageHeaderLeft, userEvenPageHeaderLeft, headerMarginCm, footerMarginCm, showHeaderFormatModal,
    draftHeaderMarginCm, draftFooterMarginCm, draftDifferentFirstPage, draftDifferentOddEven, showPageNumberModal,
    draftPageNumberPosition, draftShowPageNumberOnFirstPage, draftPageNumberMode, draftPageNumberStartAt,
    showFooterModal, footerLeftInput, footerRightInput, HEADER_MARGIN_CM_MIN, HEADER_MARGIN_CM_MAX,
    HEADER_MARGIN_CM_STEP, applyHeaderFooter, openHeaderFormatModal, applyHeaderFormat, openPageNumberModal,
    applyPageNumberSettings, openFooterModal, saveFooter, startInlineHeaderEdit, finishHeaderEdit,
  }
}
