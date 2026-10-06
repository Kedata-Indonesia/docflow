import { type Ref } from 'vue'
import type { DocsEditor } from '@kedata-indonesia/docflow-core'
import { CM_TO_PX } from './usePageSetup.js'

/**
 * Reactive refs the header/footer painter reads. Refs (not values) are passed
 * so the deferred `requestAnimationFrame` pass observes the latest settings —
 * matching the original inline implementation that re-read them after the
 * `setTimeout` window.
 */
export interface HeaderFooterPaintState {
  editor: Ref<DocsEditor['editor'] | null>
  isReady: Ref<boolean>
  pageCount: Ref<number>
  headerMarginCm: Ref<number>
  footerMarginCm: Ref<number>
  userHeaderLeft: Ref<string>
  userHeaderRight: Ref<string>
  userFooterLeft: Ref<string>
  userFooterRight: Ref<string>
  isDifferentFirstPage: Ref<boolean>
  isDifferentOddEven: Ref<boolean>
  userFirstPageHeaderLeft: Ref<string>
  userFirstPageHeaderRight: Ref<string>
  userEvenPageHeaderLeft: Ref<string>
  userEvenPageHeaderRight: Ref<string>
  resolvePageNumber: (pageIndex: number) => string
}

/**
 * Imperatively paint the generated PaginationPlus header/footer widgets with
 * the current content slots, margins and per-page `{page}`/`{total}` tokens.
 * This is a derived view only — nothing here touches the ProseMirror document.
 */
export function paintHeaderFooter(state: HeaderFooterPaintState): void {
  const { editor, isReady, pageCount } = state
  if (!editor.value || !isReady.value) return
  const totalStr = String(pageCount.value)
  const root = editor.value.view.dom

  const defaultHLeft = state.userHeaderLeft.value.replace(/{total}/g, totalStr)
  const defaultHRight = state.userHeaderRight.value.replace(/{total}/g, totalStr)
  const defaultFLeft = state.userFooterLeft.value.replace(/{total}/g, totalStr)
  const defaultFRight = state.userFooterRight.value.replace(/{total}/g, totalStr)

  editor.value.commands.updateHeaderContent(defaultHLeft, defaultHRight)
  editor.value.commands.updateFooterContent(defaultFLeft, defaultFRight)

  const headerMarginPx = `${Math.max(0, state.headerMarginCm.value) * CM_TO_PX}px`
  const footerMarginPx = `${Math.max(0, state.footerMarginCm.value) * CM_TO_PX}px`
  root.style.setProperty('--rm-header-margin-top', headerMarginPx)
  root.style.setProperty('--rm-footer-margin-bottom', footerMarginPx)

  // Dispatch an empty transaction so PaginationPlus rebuilds its generated
  // header/footer widgets after the content configuration changes.
  editor.value.view.dispatch(editor.value.state.tr)

  setTimeout(() => {
    requestAnimationFrame(() => {
      if (!editor.value || editor.value.view.dom !== root) return

      const resolveHeader = (pageNum: number, firstPage: boolean) => {
        let left = defaultHLeft
        let right = defaultHRight
        if (firstPage && state.isDifferentFirstPage.value) {
          left = state.userFirstPageHeaderLeft.value.replace(/{total}/g, totalStr)
          right = state.userFirstPageHeaderRight.value.replace(/{total}/g, totalStr)
        } else if (state.isDifferentOddEven.value && pageNum % 2 === 0) {
          left = state.userEvenPageHeaderLeft.value.replace(/{total}/g, totalStr)
          right = state.userEvenPageHeaderRight.value.replace(/{total}/g, totalStr)
        }
        return {
          left: left.replace(/{page}/g, state.resolvePageNumber(pageNum - 1)),
          right: right.replace(/{page}/g, state.resolvePageNumber(pageNum - 1)),
        }
      }

      const applyHeader = (header: Element, pageNum: number, firstPage: boolean) => {
        const content = resolveHeader(pageNum, firstPage)
        const left = header.querySelector('.rm-page-header-left')
        const right = header.querySelector('.rm-page-header-right')
        if (left) left.innerHTML = content.left
        if (right) right.innerHTML = content.right
      }

      const firstHeader = root.querySelector('.rm-first-page-header')
      if (firstHeader) applyHeader(firstHeader, 1, true)

      Array.from(root.querySelectorAll('.rm-page-break .rm-page-header')).forEach((header, index) => {
        applyHeader(header, index + 2, false)
      })

      Array.from(root.querySelectorAll('.rm-page-break .rm-page-footer')).forEach((footer, index) => {
        const pageNum = index + 1
        const pageValue = state.resolvePageNumber(pageNum - 1)
        const left = footer.querySelector('.rm-page-footer-left')
        const right = footer.querySelector('.rm-page-footer-right')
        if (left) left.innerHTML = defaultFLeft.replace(/{page}/g, pageValue)
        if (right) right.innerHTML = defaultFRight.replace(/{page}/g, pageValue)
      })
    })
  }, 50)
}
