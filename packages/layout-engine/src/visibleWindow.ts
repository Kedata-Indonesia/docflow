import type { VisiblePage } from './pageOverlayConfig'

export interface VisibleWindowInput {
  totalPages: number
  pageHeight: number
  pageGap: number
  /** Extra pages rendered above and below the viewport to hide scroll seams. */
  bufferPages: number
  scrollTop: number
  viewportHeight: number
}

/**
 * Pages that need an overlay node for the current scroll position. Pure: the
 * caller supplies the measured values, so this can be reasoned about without a
 * DOM (`VirtualPageOverlay.computeData` is the only consumer).
 */
export function computeVisiblePages({
  totalPages,
  pageHeight,
  pageGap,
  bufferPages,
  scrollTop,
  viewportHeight,
}: VisibleWindowInput): VisiblePage[] {
  const stride = pageHeight + pageGap
  const viewportBottom = scrollTop + viewportHeight
  const startPage = Math.max(0, Math.floor(scrollTop / stride) - bufferPages)
  const endPage = Math.min(totalPages, Math.ceil(viewportBottom / stride) + bufferPages)

  const pages: VisiblePage[] = []
  for (let i = startPage; i < endPage; i++) {
    pages.push({ index: i, top: i * stride, height: stride })
  }
  return pages
}

/** Cheap comparison so `onVisibleChange` only fires when the window moved. */
export function sameVisiblePages(next: VisiblePage[], previous: VisiblePage[]): boolean {
  if (next.length !== previous.length) return false
  return next.every((page, index) => {
    const other = previous[index]
    return other.index === page.index && other.top === page.top && other.height === page.height
  })
}
