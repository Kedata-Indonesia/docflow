export interface BlockInfo {
  nodeType: string
  from: number
  to: number
  top: number
  bottom: number
  rect?: DOMRect
  canSplit: boolean
  /**
   * Keep this block on one page when it fits on a page of its own: the breaker
   * moves it whole to the next page instead of splitting mid-block. Blocks
   * taller than a page are still split — there is no whole-page placement.
   */
  keepTogether?: boolean
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
   * Node types measured with `keepTogether` (issue #249). Defaults to
   * `DEFAULT_KEEP_TOGETHER_TYPES`; pass `[]` to return to plain splitting.
   */
  keepTogetherTypes?: string[]
}

/**
 * Blocks that read as one unit and should not be cut in half when they fit on a
 * page: a quote or a code listing broken across pages loses its meaning.
 * `paragraph`, `heading` and `list` stay splittable on purpose — prose is
 * expected to flow.
 */
export const DEFAULT_KEEP_TOGETHER_TYPES = ['blockquote', 'codeBlock']

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
