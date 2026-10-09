import { onUnmounted, watch, type Ref } from 'vue'
import { sanitizeInlineHTML, type DocsEditor } from '@kedata-indonesia/docflow-core'
import { assignFootnotePages, DEFERRED_PAGE } from '../utils/footnotePages.js'

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

    /**
     * Build one footnote row body. Free-text footnotes stay editable and sync
     * back to the PM node on blur (existing behavior). Citation-backed
     * footnotes (Phase 6, `data-footnote-source-id`) are citeproc-rendered and
     * read-only — their text is derived, never typed.
     */
    const buildFootnoteTextDiv = (ref: HTMLElement): HTMLDivElement => {
      const textDiv = document.createElement('div')
      textDiv.className = 'docs-footnote-item-text'

      if (ref.hasAttribute('data-footnote-source-id')) {
        const citationId = ref.getAttribute('data-citation-id') ?? ''
        const engine = (editor.value?.storage as Record<string, unknown> | undefined)?.citationEngine as
          { engine?: { renderCluster: (id: string) => string } | null } | undefined
        const html = engine?.engine?.renderCluster(citationId) ?? ''
        textDiv.classList.add('docs-footnote-item-text--citation')
        if (html) {
          textDiv.innerHTML = html
        } else {
          // Fall back to persisted content when the engine hasn't synced yet
          // (e.g. immediately after document load).
          // `data-footnote-content` is a document node attribute, so in a
          // collab session / imported document it is attacker-controlled:
          // sanitize before innerHTML (issue #71). The engine branch above is
          // citeproc output, covered by the engine escaping invariant (#72).
          const persisted = ref.getAttribute('data-footnote-content') ?? ''
          if (persisted) {
            textDiv.innerHTML = sanitizeInlineHTML(persisted)
          } else {
            textDiv.setAttribute('data-empty', 'true')
          }
        }
        return textDiv
      }

      const content = ref.getAttribute('data-footnote-content') ?? ''
      textDiv.contentEditable = 'true'
      textDiv.textContent = content
      if (!content) textDiv.setAttribute('data-empty', 'true')

      textDiv.addEventListener('input', () => {
        textDiv.removeAttribute('data-empty')
        if (!textDiv.textContent) textDiv.setAttribute('data-empty', 'true')
      })

      textDiv.addEventListener('blur', () => {
        const newContent = textDiv.textContent?.trim() ?? ''
        saveFootnoteItemContent(ref, newContent)
      })
      return textDiv
    }

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

      const container = document.createElement('div')
      container.className = 'docs-page-footnotes docs-pageless-footnotes'

      const sep = document.createElement('div')
      sep.className = 'docs-footnotes-sep'
      container.appendChild(sep)

      allRefs.forEach((ref, n) => {
        const row = document.createElement('div')
        row.className = 'docs-footnote-item'

        const num = document.createElement('sup')
        num.className = 'docs-footnote-item-num'
        num.textContent = String(n + 1)

        const textDiv = buildFootnoteTextDiv(ref)

        ref.dataset.footnoteItemId = `fn-pageless-${n}`
        row.id = `fn-pageless-${n}`

        row.appendChild(num)
        row.appendChild(textDiv)
        container.appendChild(row)
      })

      paper.appendChild(container)
      return
    }

    // Map page index → footnote refs on that page.
    //
    // Refs that sit past the last page break mean pagination has not covered the
    // whole document yet (#19). They are reported as deferred instead of being
    // clamped onto the last page — that clamp is what stacked every footnote on
    // the final page. We retry a bounded number of times for pagination to catch
    // up, and only then fall back to the last page so no footnote disappears.
    const breakerTops: number[] = []
    const breakerBottoms: number[] = []
    pageBreaks.forEach((pb) => {
      const breaker = pb.querySelector<HTMLElement>('.breaker')
      const rect = breaker?.getBoundingClientRect()
      breakerTops.push(rect ? rect.top : Number.POSITIVE_INFINITY)
      breakerBottoms.push(rect ? rect.bottom : Number.NEGATIVE_INFINITY)
    })
    const { pages: assignedPages, deferred } = assignFootnotePages(
      allRefs.map((ref) => ref.getBoundingClientRect().top),
      breakerTops,
      breakerBottoms,
    )
    if (deferred > 0 && footnoteRetryCount < FOOTNOTE_MAX_RETRIES) {
      footnoteRetryCount++
      scheduleFootnotes(400)
    } else if (deferred === 0) {
      footnoteRetryCount = 0
    }

    const pageRefs = new Map<number, HTMLElement[]>()
    pageBreaks.forEach((_, i) => pageRefs.set(i, []))
    allRefs.forEach((ref, i) => {
      const page = assignedPages[i]
      const target = page === undefined || page === DEFERRED_PAGE ? pageBreaks.length - 1 : page
      pageRefs.get(target)!.push(ref)
    })

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

      // Build inline footnote area
      const container = document.createElement('div')
      container.className = 'docs-page-footnotes'

      // Separator line
      const sep = document.createElement('div')
      sep.className = 'docs-footnotes-sep'
      container.appendChild(sep)

      refs.forEach((ref, n) => {
        const row = document.createElement('div')
        row.className = 'docs-footnote-item'

        const num = document.createElement('sup')
        num.className = 'docs-footnote-item-num'
        num.textContent = String(pageStartNumber + n)

        const textDiv = buildFootnoteTextDiv(ref)

        // Clicking the sup ref in the text jumps here
        ref.dataset.footnoteItemId = `fn-${pageIdx}-${n}`
        row.id = `fn-${pageIdx}-${n}`

        row.appendChild(num)
        row.appendChild(textDiv)
        container.appendChild(row)
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
      const id = target.dataset.footnoteItemId
      if (!id) return
      const itemRow = document.getElementById(id)
      const textEl = itemRow?.querySelector<HTMLElement>('.docs-footnote-item-text')
      if (textEl) {
        textEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        textEl.focus()
        // Place cursor at end
        const range = document.createRange()
        range.selectNodeContents(textEl)
        range.collapse(false)
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(range)
      }
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
    const citationStorage = (editor.value.storage as Record<string, unknown>).citationEngine as
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
