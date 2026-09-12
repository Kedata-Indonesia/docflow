/**
 * Pure page-count arithmetic for the pagination extension.
 *
 * Split out of `PaginationPlus.ts` so the policy is testable without a DOM:
 * the DOM code measures, this decides.
 */

/** Hard ceiling; the extension never grows past this. */
export const MAX_PAGES = 1000

export interface PageGrowthInput {
  /** Pages currently rendered (page-break widgets in the document). */
  currentPageCount: number
  /** How far the last content element extends past the last page break. */
  lastPageGap: number
  /** Usable content height of one page (page height minus header/footer areas). */
  pageContentAreaHeight: number
  /** Pages the measured content height needs, ignoring the current breaks. */
  maxPagesByContent: number
}

/**
 * Pages to render after measuring an overflow at the end of the document.
 *
 * Two rules matter here, both learned from a real document (AKTIF AI NA):
 *
 * 1. The count must grow whenever content extends past the last page break.
 *    It used to *freeze* (`return currentPageCount`) when the last element was
 *    taller than one page and was not a splittable table — e.g. a long `<ol>`
 *    (774px vs a 692px content area). A paragraph or list longer than a page
 *    still needs extra pages; refusing them left the document under-paginated
 *    (6 pages for ~12 pages of content) and every footnote ref past the last
 *    break piled onto the last page. A tall block is not a reason to stop: the
 *    growth is already bounded below.
 * 2. Growth stays bounded by what the content can actually use (`contentCap`),
 *    so a measure/layout feedback loop cannot run away.
 */
export function grownPageCount(input: PageGrowthInput): number {
  const { currentPageCount, lastPageGap, pageContentAreaHeight, maxPagesByContent } = input
  if (!(lastPageGap > 0) || !(pageContentAreaHeight > 0)) {
    return currentPageCount
  }
  const addPage = Math.ceil(lastPageGap / pageContentAreaHeight)
  if (!Number.isFinite(addPage) || addPage <= 0) {
    return currentPageCount
  }
  const contentCap = Math.max(currentPageCount, maxPagesByContent + 1)
  const desired = currentPageCount + addPage
  if (desired > contentCap) {
    return contentCap
  }
  if (desired > MAX_PAGES) {
    return currentPageCount
  }
  return desired
}
