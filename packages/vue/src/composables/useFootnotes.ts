import { onUnmounted, watch, type Ref } from 'vue'
import type { DocsEditor } from '@kedata-indonesia/docflow-core'
import { buildFootnoteTextDiv, type FootnoteItemDeps } from './footnoteItems.js'
import { paintPagelessFootnotes, paintPagedFootnotes } from './footnotePaint.js'

export interface UseFootnotesOptions {
  editor: Ref<DocsEditor['editor'] | null>
  editorRef: Ref<HTMLElement | null>
  isReady: Ref<boolean>
}

export function useFootnotes(options: UseFootnotesOptions) {
  const { editor, editorRef, isReady } = options

  let updateFootnotesTimer: ReturnType<typeof setTimeout> | null = null
  let resizeTimer: ReturnType<typeof setTimeout> | null = null

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
   * The two paint branches live in `footnotePaint.ts`; this function only
   * resolves the host elements and the item-builder ports the branches need.
   */
  const updateFootnotes = () => {
    if (!editor.value || !isReady.value) return

    const editorDom = editor.value.view.dom

    const paginationEl = editorDom.querySelector('[data-rm-pagination]')
    if (!paginationEl) return

    const citationEngine = (editor.value.storage as Record<string, unknown> | undefined)?.citationEngine as
      { engine?: { renderCluster: (id: string) => string } | null } | undefined
    const deps: FootnoteItemDeps = {
      renderCitation: (citationId) => citationEngine?.engine?.renderCluster(citationId) ?? '',
      saveContent: saveFootnoteItemContent,
    }
    const buildItem = (ref: HTMLElement) => buildFootnoteTextDiv(ref, deps)

    const pageBreaks = Array.from(paginationEl.querySelectorAll<HTMLElement>('.rm-page-break'))
    const allRefs = Array.from(editorDom.querySelectorAll<HTMLElement>('.docs-footnote-ref'))

    if (pageBreaks.length === 0) {
      // Pageless mode or layout not computed yet: render footnotes at the very
      // bottom of the paper.
      const paper = editorRef.value
      if (!paper) {
        // Number the inline refs even when the host is not mounted, matching
        // the original inline flow.
        allRefs.forEach((ref, i) => { ref.textContent = String(i + 1) })
        return
      }
      paintPagelessFootnotes(paper, allRefs, buildItem)
      return
    }

    paintPagedFootnotes(pageBreaks, allRefs, buildItem)
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
