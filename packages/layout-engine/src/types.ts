export interface BlockInfo {
  nodeType: string
  from: number
  to: number
  top: number
  bottom: number
  rect?: DOMRect
  canSplit: boolean
  forceBreak?: boolean
  splitOffset?: number
  /** True when this block's height exceeds the available page height.
   *  The renderer should apply overflow-hidden at the page level to clip it. */
  pageOverflow?: boolean
  /** CSS margin-top in pixels (computed style) */
  marginTop?: number
  /** CSS margin-bottom in pixels (computed style) */
  marginBottom?: number
}

export interface Page {
  from: number
  to: number
  blocks: BlockInfo[]
}

export interface LayoutOptions {
  pageHeight: number
  pageWidth?: number
  margins?: {
    top: number
    bottom: number
    left: number
    right: number
  }
  /**
   * Maximum characters per page, used as a secondary cutoff alongside the
   * height-based limit.  Computed dynamically from font metrics, margins,
   * and page dimensions so it adapts to font-size / orientation changes.
   */
  maxCharsPerPage?: number
}

export interface LayoutResult {
  pages: Page[]
  invalidatedAt?: number
}

export interface PageSize {
  id: string
  name: string
  pageWidth: number
  pageHeight: number
}

export const PAGE_SIZES: PageSize[] = [
  { id: 'a4', name: 'A4', pageWidth: 794, pageHeight: 1123 },
  { id: 'f4', name: 'F4', pageWidth: 816, pageHeight: 1204 },
  { id: 'letter', name: 'Letter', pageWidth: 816, pageHeight: 1056 },
  { id: 'legal', name: 'Legal', pageWidth: 816, pageHeight: 1344 },
  { id: 'a5', name: 'A5', pageWidth: 559, pageHeight: 794 },
]

export function getPageSize(id: string): PageSize | undefined {
  return PAGE_SIZES.find((size) => size.id === id)
}
