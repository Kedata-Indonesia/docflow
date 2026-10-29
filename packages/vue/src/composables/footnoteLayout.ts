import { assignFootnotePages, DEFERRED_PAGE } from '../utils/footnotePages.js'

export interface BreakerGeometry {
  /** Viewport top of each page's break area. */
  tops: number[]
  /** Viewport bottom of each page's break area. */
  bottoms: number[]
}

/** Measure the break area of every page frame, in page order. */
export function measureBreakerGeometry(pageBreaks: HTMLElement[]): BreakerGeometry {
  const tops: number[] = []
  const bottoms: number[] = []
  pageBreaks.forEach((pb) => {
    const breaker = pb.querySelector<HTMLElement>('.breaker')
    const rect = breaker?.getBoundingClientRect()
    tops.push(rect ? rect.top : Number.POSITIVE_INFINITY)
    bottoms.push(rect ? rect.bottom : Number.NEGATIVE_INFINITY)
  })
  return { tops, bottoms }
}

export interface FootnotePageGrouping {
  /** Page index → refs on that page, in document order. */
  pageRefs: Map<number, HTMLElement[]>
  /** Refs past the last page break — pagination has not covered the doc yet (#19). */
  deferred: number
}

/**
 * Map each footnote ref to the page it belongs to.
 *
 * Refs that sit past the last page break mean pagination has not covered the
 * whole document yet (#19). They are reported as deferred instead of being
 * clamped onto the last page — that clamp is what stacked every footnote on the
 * final page. The caller retries a bounded number of times for pagination to
 * catch up, and only then does this fall back to the last page so no footnote
 * disappears.
 */
export function groupRefsByPage(
  refs: HTMLElement[],
  geometry: BreakerGeometry,
  pageCount: number,
): FootnotePageGrouping {
  const { pages: assignedPages, deferred } = assignFootnotePages(
    refs.map((ref) => ref.getBoundingClientRect().top),
    geometry.tops,
    geometry.bottoms,
  )

  const pageRefs = new Map<number, HTMLElement[]>()
  for (let i = 0; i < pageCount; i++) pageRefs.set(i, [])
  refs.forEach((ref, i) => {
    const page = assignedPages[i]
    const target = page === undefined || page === DEFERRED_PAGE ? pageCount - 1 : page
    pageRefs.get(target)!.push(ref)
  })
  return { pageRefs, deferred }
}
