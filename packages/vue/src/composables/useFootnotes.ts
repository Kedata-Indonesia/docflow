import { onUnmounted, watch, type Ref } from 'vue'
import type { DocsEditor } from '@kedata-indonesia/docflow-core'
import {
  createFootnoteContainer,
  createFootnoteRow,
  createFootnoteTextDiv,
} from './footnoteDom.js'
import { groupRefsByPage, measureBreakerGeometry } from './footnoteLayout.js'
import { jumpToFootnoteItem } from './footnoteJump.js'

export interface UseFootnotesOptions {
  editor: Ref<DocsEditor['editor'] | null>
  editorRef: Ref<HTMLElement | null>
  isReady: Ref<boolean>
  pageCount: Ref<number>
}

export function useFootnotes(options: UseFootnotesOptions) {
  const { editor, editorRef, isReady, pageCount } = options

  let updateFootnotesTimer: ReturnType<typeof setTimeout> | null = null
  let resizeTimer: ReturnType<typeof setTimeout> | null = null
  // How many times the footnote pass may re-run while waiting for pagination to
  // cover the whole document (#19) before falling back to the last page.
  let footnoteRetryCount = 0
  const FOOTNOTE_MAX_RETRIES = 3

  /**
   * Save edited footnote content from a contenteditable div back to the
   * ProseMirror node attribute when the user blurs the item.
   */
  const saveFootnoteItemContent = (refEl: HTMLElement, newContent: string) => {
    if (!editor.value) return
    const view = editor.value.view
    view.state.doc.descendants((node, pos): boolean | undefined | void => {
      if (node.type.name === 'footnote') {
        if (view.nodeDOM(pos) === refEl) {
          view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { content: newContent }))
          return false
        }
      }
      return undefined
    })
  }

  /** The body of one note — editable for text notes, citeproc output for citations. */
  const renderFootnoteText = (ref: HTMLElement) =>
    createFootnoteTextDiv(ref, {
      getEditor: () => editor.value,
      saveContent: saveFootnoteItemContent,
    })

  /**
   * Build / refresh the inline footnote area at the bottom of each page.
   * ─ Numbers the inline <sup> refs CONTINUOUSLY through the document (Word /
   *   Google Docs behavior): page N continues from the last number on page
   *   N-1. This also matches the citation engine's sequential noteIndex.
   * ─ Creates contenteditable footnote items that sync back to ProseMirror on blur.
   * ─ Skips rebuilding any page whose footnote area is currently focused.
   */
  const updateFootnotes = () => {
    if (!editor.value || !isReady.value) return

    const editorDom = editor.value.view.dom

    const paginationEl = editorDom.querySelector('[data-rm-pagination]')
    if (!paginationEl) return

    const pageBreaks = Array.from(paginationEl.querySelectorAll<HTMLElement>('.rm-page-break'))
    const allRefs = Array.from(editorDom.querySelectorAll<HTMLElement>('.docs-footnote-ref'))

    if (pageBreaks.length === 0) {
      // Pageless mode or layout not computed yet: render footnotes at the very bottom of the paper
      allRefs.forEach((ref, i) => { ref.textContent = String(i + 1) })

      // Find paper container
      const paper = editorRef.value
      if (!paper) return

      // Remove existing pageless container
      paper.querySelector('.docs-pageless-footnotes')?.remove()

      if (allRefs.length === 0) return

      // Skip if a footnote text input inside this container is currently focused
      const existing = paper.querySelector<HTMLElement>('.docs-pageless-footnotes')
      if (existing?.querySelector<HTMLElement>('.docs-footnote-item-text:focus')) return

      const container = createFootnoteContainer('docs-pageless-footnotes')
      allRefs.forEach((ref, n) => {
        const itemId = `fn-pageless-${n}`
        ref.dataset.footnoteItemId = itemId
        container.appendChild(createFootnoteRow(itemId, String(n + 1), renderFootnoteText(ref)))
      })

      paper.appendChild(container)
      return
    }

    const geometry = measureBreakerGeometry(pageBreaks)
    const { pageRefs, deferred } = groupRefsByPage(allRefs, geometry, pageBreaks.length)
    if (deferred > 0 && footnoteRetryCount < FOOTNOTE_MAX_RETRIES) {
      footnoteRetryCount++
      scheduleFootnotes(400)
    } else if (deferred === 0) {
      footnoteRetryCount = 0
    }

    // Footnotes are numbered continuously through the document — the first
    // footnote on a page continues from the last number of the previous page.
    let nextFootnoteNumber = 1
    pageBreaks.forEach((pb, pageIdx) => {
      const refs = pageRefs.get(pageIdx) ?? []
      const pageStartNumber = nextFootnoteNumber
      nextFootnoteNumber += refs.length

      // Number inline refs (continuous across pages)
      refs.forEach((ref, n) => { ref.textContent = String(pageStartNumber + n) })

      // Skip rebuild if a footnote item on this page has focus
      const existing = pb.querySelector<HTMLElement>('.docs-page-footnotes')
      if (existing?.querySelector<HTMLElement>('.docs-footnote-item-text:focus')) return

      existing?.remove()
      if (refs.length === 0) return

      const container = createFootnoteContainer()
      refs.forEach((ref, n) => {
        const itemId = `fn-${pageIdx}-${n}`
        // Clicking the sup ref in the text jumps here
        ref.dataset.footnoteItemId = itemId
        container.appendChild(
          createFootnoteRow(itemId, String(pageStartNumber + n), renderFootnoteText(ref)),
        )
      })

      // Find the page breaker (the layout divider which contains the footer)
      const breaker = pb.querySelector('.breaker')
      if (breaker) {
        // Prepend so it sits exactly above the footer content inside the breaker
        breaker.insertBefore(container, breaker.firstChild)
      } else {
        pb.appendChild(container)
      }
    })
  }

  // Click on sup ref → scroll to + focus corresponding footnote item
  watch(isReady, (ready) => {
    if (!ready || !editor.value) return
    editor.value.view.dom.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('.docs-footnote-ref')
      if (!target) return
      e.preventDefault()
      e.stopPropagation()
      jumpToFootnoteItem(target)
    })
  })

  function scheduleFootnotes(delay: number) {
    if (updateFootnotesTimer) clearTimeout(updateFootnotesTimer)
    updateFootnotesTimer = setTimeout(() => {
      updateFootnotesTimer = null
      updateFootnotes()
    }, delay)
  }

  const onResize = () => {
    if (resizeTimer) clearTimeout(resizeTimer)
    if (updateFootnotesTimer) {
      clearTimeout(updateFootnotesTimer)
      updateFootnotesTimer = null
    }
    resizeTimer = setTimeout(() => {
      resizeTimer = null
      updateFootnotes()
    }, 150)
  }

  watch(isReady, (ready) => {
    if (!ready || !editor.value) return

    scheduleFootnotes(150)

    // Run on update & selection changes
    editor.value.on('update', () => { scheduleFootnotes(60) })
    editor.value.on('selectionUpdate', () => { scheduleFootnotes(100) })

    // Citation-backed footnotes repaint when the engine emits change
    // (source edit, style switch, citation add/remove).
    const citationStorage = (editor.value.storage as unknown as Record<string, unknown>).citationEngine as
      { engine?: { onChange: (cb: () => void) => () => void } | null } | undefined
    citationStorage?.engine?.onChange(() => { scheduleFootnotes(30) })

    // Listen to window resize because pagination calculations layout can shift
    window.addEventListener('resize', onResize)
  })

  // Footnote bodies live inside each page's break area, so when the page count
  // changes (pagination recomputed) the pass must run again — otherwise notes
  // stay pinned to the old last page even though new pages exist (#19).
  watch(pageCount, () => { scheduleFootnotes(50) })

  onUnmounted(() => {
    if (resizeTimer) clearTimeout(resizeTimer)
    if (updateFootnotesTimer) clearTimeout(updateFootnotesTimer)
    window.removeEventListener('resize', onResize)
  })

  return {
    updateFootnotes,
    scheduleFootnotes,
  }
}
