import type { EditorView } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { EditorWithPaginationStorage, RowMeasurement } from './tableSplitTypes.js'

/**
 * Page-content height in px: `editor.storage.PaginationPlus.pageHeight` minus
 * margins and the first page's header/footer. This matches the content area the
 * editor renders against, regardless of which page the table ends up on — both
 * pages use the same `_pageHeight` calculation (the difference is whether the
 * header is *inside* the page or floating above it; either way the table fits
 * in `_pageHeight`).
 */
export function readPageContentHeightPx(
  view: EditorView,
  editor: EditorWithPaginationStorage | null,
): number | null {
  const storage = editor?.storage?.PaginationPlus
  if (storage && typeof storage.pageHeight === 'number') {
    const h1 = storage.headerHeight?.get?.(1) ?? 0
    const f1 = storage.footerHeight?.get?.(1) ?? 0
    const contentPx = storage.pageHeight
      - (storage.marginTop ?? 0)
      - (storage.marginBottom ?? 0)
      - (storage.contentMarginTop ?? 0)
      - (storage.contentMarginBottom ?? 0)
      - h1 - f1
    if (Number.isFinite(contentPx) && contentPx > 0) return contentPx
  }
  // Fallback: the CSS variable PaginationPlus exposes. Useful in tests where
  // storage hasn't been populated yet but the variable is set manually.
  const raw = view.dom.style.getPropertyValue('--rm-max-content-child-height')
  if (raw) {
    const px = parseFloat(raw)
    if (Number.isFinite(px) && px > 0) return px
  }
  return null
}

function measureElementPx(el: Element | null): number {
  if (!el || !(el instanceof HTMLElement)) return 0
  return el.getBoundingClientRect().height
}

/**
 * Return the vertical space still available on the page at the given PM
 * position, in pixels, using the live (pre-split) DOM.
 *
 * IMPORTANT: this reads `.breaker` positions from the CURRENT DOM, which only
 * reflects splits that have already been dispatched — not splits still pending
 * in this same `runSplitPass` call. Do not call this for a table that comes
 * after another table in document order within the same pass; use the pass's
 * cursor instead, which accounts for the pending chain output of everything
 * before it. This is only correct for the FIRST table processed in a pass
 * (nothing pending ahead of it yet).
 */
export function availablePxAt(
  view: EditorView,
  pos: number,
  defaultPageContentPx: number,
): number | null {
  try {
    const tableCoords = view.coordsAtPos(pos + 1)
    const tableTop = tableCoords.top
    const paginationWrapper = view.dom.querySelector('[data-rm-pagination]')
    if (!paginationWrapper) return defaultPageContentPx
    const breakers = paginationWrapper.querySelectorAll('.rm-page-break .breaker')
    for (let i = 0; i < breakers.length; i++) {
      const br = breakers[i]
      if (!(br instanceof HTMLElement)) continue
      const breakTop = br.getBoundingClientRect().top
      if (breakTop > tableTop) {
        return Math.max(1, Math.floor(breakTop - tableTop))
      }
    }
    return defaultPageContentPx
  } catch {
    return null
  }
}

/**
 * Measure every `<tr>` of a rendered table, accumulating downwards. Returns
 * `null` when the DOM does not (yet) match the node — the caller then skips
 * this table instead of splitting on bogus numbers.
 */
export function measureRows(tableNode: PMNode, tableDom: HTMLElement): RowMeasurement[] | null {
  const expectedRows = tableNode.childCount
  const trs = tableDom.querySelectorAll(':scope > tbody > tr')
  if (trs.length !== expectedRows) return null

  const measurements: RowMeasurement[] = []
  let cumulative = 0
  for (let i = 0; i < trs.length; i++) {
    const h = measureElementPx(trs[i])
    cumulative += h
    measurements.push({ rowIndex: i, heightPx: h, cumulativePx: cumulative })
  }
  return measurements
}
