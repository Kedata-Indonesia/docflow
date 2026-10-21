import { type Ref } from 'vue'
import { sanitizeInlineHTML, type DocsEditor } from '@kedata-indonesia/docflow-core'
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
  userFirstPageFooterLeft: Ref<string>
  userFirstPageFooterRight: Ref<string>
  userEvenPageFooterLeft: Ref<string>
  userEvenPageFooterRight: Ref<string>
  resolvePageNumber: (pageIndex: number) => string
}

/**
 * A multi-line first-page header sits in the paper's top margin (absolute), so
 * it cannot push the body by itself. Measure its rendered height and publish the
 * overflow as `--rm-first-header-overflow`; the stylesheet adds it to the paper's
 * top padding and removes it from page 1's content height (issue #319).
 */
function syncFirstPageHeaderOverflow(root: HTMLElement): void {
  const firstHeader = root.querySelector<HTMLElement>('.rm-first-page-header')
  const content = firstHeader?.querySelector<HTMLElement>('.rm-page-header-content')
  if (!firstHeader || !content) {
    root.style.setProperty('--rm-first-header-overflow', '0px')
    return
  }

  const style = getComputedStyle(root)
  // Rects are visual px under the zoom transform; the CSS vars are layout px (#144).
  const zoom = Math.max(0.01, parseFloat(style.getPropertyValue('--docflow-zoom')) || 1)
  const marginTop = parseFloat(style.getPropertyValue('--rm-margin-top')) || 0
  const headerMarginTop = parseFloat(style.getPropertyValue('--rm-header-margin-top')) || 0
  const contentHeight = content.getBoundingClientRect().height / zoom

  // A small breathing gap keeps the first body block from touching the header.
  const HEADER_BODY_GAP = 8
  const overflow = Math.max(0, headerMarginTop + contentHeight + HEADER_BODY_GAP - marginTop)
  root.style.setProperty('--rm-first-header-overflow', `${Math.round(overflow * 100) / 100}px`)
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

  // Sanitize the document-derived templates ONCE here rather than per page: a
  // 100-page document would otherwise pay for 100 DOMParser calls. Every
  // per-page value below is derived from these sanitized strings by numeric
  // `{page}`/`{total}` substitution only, which cannot introduce markup.
  const safeHLeft = sanitizeInlineHTML(state.userHeaderLeft.value)
  const safeHRight = sanitizeInlineHTML(state.userHeaderRight.value)
  const safeFLeft = sanitizeInlineHTML(state.userFooterLeft.value)
  const safeFRight = sanitizeInlineHTML(state.userFooterRight.value)
  const safeFirstHLeft = sanitizeInlineHTML(state.userFirstPageHeaderLeft.value)
  const safeFirstHRight = sanitizeInlineHTML(state.userFirstPageHeaderRight.value)
  const safeEvenHLeft = sanitizeInlineHTML(state.userEvenPageHeaderLeft.value)
  const safeEvenHRight = sanitizeInlineHTML(state.userEvenPageHeaderRight.value)
  const safeFirstFLeft = sanitizeInlineHTML(state.userFirstPageFooterLeft.value)
  const safeFirstFRight = sanitizeInlineHTML(state.userFirstPageFooterRight.value)
  const safeEvenFLeft = sanitizeInlineHTML(state.userEvenPageFooterLeft.value)
  const safeEvenFRight = sanitizeInlineHTML(state.userEvenPageFooterRight.value)

  const defaultHLeft = safeHLeft.replace(/{total}/g, totalStr)
  const defaultHRight = safeHRight.replace(/{total}/g, totalStr)
  const defaultFLeft = safeFLeft.replace(/{total}/g, totalStr)
  const defaultFRight = safeFRight.replace(/{total}/g, totalStr)

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
          left = safeFirstHLeft.replace(/{total}/g, totalStr)
          right = safeFirstHRight.replace(/{total}/g, totalStr)
        } else if (state.isDifferentOddEven.value && pageNum % 2 === 0) {
          left = safeEvenHLeft.replace(/{total}/g, totalStr)
          right = safeEvenHRight.replace(/{total}/g, totalStr)
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

      const resolveFooter = (pageNum: number) => {
        let left = defaultFLeft
        let right = defaultFRight
        if (pageNum === 1 && state.isDifferentFirstPage.value) {
          left = safeFirstFLeft.replace(/{total}/g, totalStr)
          right = safeFirstFRight.replace(/{total}/g, totalStr)
        } else if (state.isDifferentOddEven.value && pageNum % 2 === 0) {
          left = safeEvenFLeft.replace(/{total}/g, totalStr)
          right = safeEvenFRight.replace(/{total}/g, totalStr)
        }
        const pageValue = state.resolvePageNumber(pageNum - 1)
        return {
          left: left.replace(/{page}/g, pageValue),
          right: right.replace(/{page}/g, pageValue),
        }
      }

      Array.from(root.querySelectorAll('.rm-page-break .rm-page-footer')).forEach((footer, index) => {
        const content = resolveFooter(index + 1)
        const left = footer.querySelector('.rm-page-footer-left')
        const right = footer.querySelector('.rm-page-footer-right')
        if (left) left.innerHTML = content.left
        if (right) right.innerHTML = content.right
      })

      // The first-page header is absolute, so reserve its measured overflow in
      // the paper padding / page-1 content height (issue #319).
      syncFirstPageHeaderOverflow(root)

      // Let PaginationPlus re-measure the now-painted header height. Without
      // this the per-page content area can still reflect the previous header
      // height, so a multi-line header would not reduce page capacity.
      if (editor.value && editor.value.view.dom === root) {
        editor.value.view.dispatch(editor.value.state.tr)
      }
    })
  }, 50)
}
