import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'

export interface TocHeading {
  level: number
  text: string
  pos: number
}

/** Walk a doc and collect H1–H3 headings in document order. */
export function collectHeadingsFromDoc(doc: PMNode): TocHeading[] {
  const headings: TocHeading[] = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      const level = node.attrs.level as number
      if (level === 1 || level === 2 || level === 3) {
        headings.push({ level, text: node.textContent.trim(), pos })
      }
    }
    return true
  })
  return headings
}

/**
 * Walk the doc and collect H1–H3 headings in document order. Same algorithm
 * as the outline sidebar (TOCSidebar.vue) — positions are captured now and go
 * stale as the doc is edited; refresh to recapture.
 */
export function collectHeadings(editor: Editor): TocHeading[] {
  return collectHeadingsFromDoc(editor.state.doc)
}

/** Maps a doc position to a 1-based page number, or `null` when pageless. */
export type PageResolver = (pos: number) => number | null

/**
 * Page-number resolver, captured once per generation. Mirrors the geometry in
 * DocsEditor.updatePageStats: a heading's page is 1 + the number of page
 * breakers above its y-coordinate, measured against the pagination wrapper
 * inside the editor DOM. Degrades to `null` (no page numbers rendered) when
 * there is no pagination — pageless mode or a headless editor.
 */
export function createPageResolver(editor: Editor): PageResolver {
  let breakers: HTMLElement[] = []
  try {
    const pagination = editor.view.dom.querySelector('[data-rm-pagination]')
    if (pagination) {
      breakers = Array.from(pagination.querySelectorAll('.rm-page-break .breaker'))
        .filter((el): el is HTMLElement => el instanceof HTMLElement)
    }
  } catch { /* no pagination DOM — pageless */ }
  if (breakers.length === 0) return () => null

  const editorDom = editor.view.dom
  return (pos) => {
    try {
      const coords = editor.view.coordsAtPos(pos)
      const top = coords.top - editorDom.getBoundingClientRect().top + editorDom.scrollTop
      let page = 1
      for (const breaker of breakers) {
        if (top < breaker.offsetTop) return page
        page++
      }
      return page
    } catch {
      return null
    }
  }
}
