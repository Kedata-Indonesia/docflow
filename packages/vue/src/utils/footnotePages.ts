/**
 * Page assignment for editor footnotes.
 *
 * Docflow renders footnote bodies inside each page's break area, so a reference
 * has to know which page it belongs to. The DOM pass in `DocsEditor.vue`
 * measures the rectangles and calls this; keeping the decision pure makes the
 * awkward case testable.
 *
 * The awkward case is real (AKTIF AI NA, docflow #248): when pagination has
 * not covered the whole document yet, references near the end sit *past* the
 * last page break. The old rule clamped every one of them onto the last page,
 * which is how 13 footnotes ended up stacked on page 6 while their text was
 * twelve pages long. Those references are reported as `deferred` instead, so
 * the caller can retry once pagination catches up — and only fall back to the
 * last page if it never does.
 */

/** Page index reported for a reference that lies beyond the paginated area. */
export const DEFERRED_PAGE = -1

export interface FootnotePageAssignment {
  /** Page index per reference, or DEFERRED_PAGE. */
  pages: number[]
  /** How many references were deferred (beyond the last page). */
  deferred: number
}

/**
 * @param refTops     viewport top of each footnote reference, in document order
 * @param breakerTops viewport top of each page's break area, one per page
 * @param breakerBottoms viewport bottom of each page's break area, one per page
 */
export function assignFootnotePages(
  refTops: number[],
  breakerTops: number[],
  breakerBottoms: number[],
): FootnotePageAssignment {
  const pages: number[] = []
  let deferred = 0

  if (breakerTops.length === 0) {
    return { pages: refTops.map(() => DEFERRED_PAGE), deferred: refTops.length }
  }

  const lastPage = breakerTops.length - 1
  const lastBottom = breakerBottoms[lastPage] ?? Number.POSITIVE_INFINITY

  for (const top of refTops) {
    let assigned = -1
    // A reference belongs to the first page whose break area starts below it.
    // The last page is handled separately: its area is the remainder.
    for (let i = 0; i < lastPage; i++) {
      if (top < (breakerTops[i] ?? Number.NEGATIVE_INFINITY)) {
        assigned = i
        break
      }
    }
    if (assigned === -1) {
      if (top > lastBottom) {
        pages.push(DEFERRED_PAGE)
        deferred++
        continue
      }
      assigned = lastPage
    }
    pages.push(assigned)
  }

  return { pages, deferred }
}
