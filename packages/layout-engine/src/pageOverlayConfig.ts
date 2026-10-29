import type { PageSize } from './types'
import { getPageSize } from './types'

export interface PageOverlayConfig {
  pageSize: PageSize | string
  margins?: { top: number; bottom: number; left: number; right: number }
  pageGap?: number
  headerLeft?: string
  headerRight?: string
  footerLeft?: string
  footerRight?: string
}

export interface VisiblePage {
  index: number
  top: number
  height: number
}

export interface PageOverlayData {
  totalPages: number
  visiblePages: VisiblePage[]
  config: Required<PageOverlayConfig> & { pageSize: PageSize }
}

/** Config after defaults were applied and the page size was resolved. */
export type ResolvedOverlayConfig = Required<PageOverlayConfig> & { pageSize: PageSize }

/** Used when a caller passes a page-size id that is not in `PAGE_SIZES`. */
const FALLBACK_PAGE_SIZE: PageSize = {
  id: 'a4',
  name: 'A4',
  pageWidth: 794,
  pageHeight: 1123,
}

/**
 * Resolve a page size that may be given as an id. `fallback` is the value to keep
 * when the id is unknown — the constructor falls back to A4, `updateConfig` keeps
 * the page size that is already active.
 */
export function resolvePageSize(
  pageSize: PageSize | string,
  fallback: PageSize = FALLBACK_PAGE_SIZE,
): PageSize {
  return typeof pageSize === 'string' ? (getPageSize(pageSize) ?? fallback) : pageSize
}

/** Apply the overlay defaults; mirrors what the constructor used to inline. */
export function resolveOverlayConfig(config: PageOverlayConfig): ResolvedOverlayConfig {
  return {
    pageSize: resolvePageSize(config.pageSize),
    margins: config.margins ?? { top: 20, bottom: 20, left: 50, right: 50 },
    pageGap: config.pageGap ?? 50,
    headerLeft: config.headerLeft ?? '',
    headerRight: config.headerRight ?? '',
    footerLeft: config.footerLeft ?? '',
    footerRight: config.footerRight ?? '',
  }
}

/** Ids can be reused, so compare the resolved geometry rather than the reference. */
export const samePageSize = (a: PageSize, b: PageSize): boolean =>
  a.id === b.id && a.pageWidth === b.pageWidth && a.pageHeight === b.pageHeight

export const sameMargins = (
  a: { top: number; bottom: number; left: number; right: number },
  b: { top: number; bottom: number; left: number; right: number },
): boolean =>
  a.top === b.top && a.bottom === b.bottom && a.left === b.left && a.right === b.right
