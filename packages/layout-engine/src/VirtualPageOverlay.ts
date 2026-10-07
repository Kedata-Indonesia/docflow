import { PageLayout, type EditorLike } from './PageLayout'
import type { LayoutResult, PageSize } from './types'
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

/** Ids can be reused, so compare the resolved geometry rather than the reference. */
const samePageSize = (a: PageSize, b: PageSize): boolean =>
  a.id === b.id && a.pageWidth === b.pageWidth && a.pageHeight === b.pageHeight

const sameMargins = (
  a: { top: number; bottom: number; left: number; right: number },
  b: { top: number; bottom: number; left: number; right: number },
): boolean =>
  a.top === b.top && a.bottom === b.bottom && a.left === b.left && a.right === b.right

/**
 * Manages virtualized page overlays for a ProseMirror editor.
 *
 * Instead of creating DOM nodes for ALL pages (like tiptap-pagination-plus),
 * this only tracks which pages are currently visible in the viewport and
 * provides the data needed to render a lightweight overlay layer.
 *
 * Usage:
 *   const overlay = new VirtualPageOverlay(editor, config, scrollEl, bufferPages?)
 *   overlay.layout().then(data => render(data))
 *   // On scroll: overlay.updateVisible().then(data => render(data))
 */
export class VirtualPageOverlay {
  pageLayout: PageLayout
  private config: Required<PageOverlayConfig> & { pageSize: PageSize }
  private scrollEl: HTMLElement
  private editorEl: HTMLElement
  private bufferPages: number
  private lastResult: LayoutResult | null = null
  private lastVisible: VisiblePage[] = []
  private lastScrollTop = -1
  private scrollHandler: (() => void) | null = null
  private rafId = 0

  constructor(
    editor: EditorLike | HTMLElement,
    config: PageOverlayConfig,
    scrollEl: HTMLElement,
    bufferPages = 2,
  ) {
    const ps = typeof config.pageSize === 'string'
      ? (getPageSize(config.pageSize) ?? { id: 'a4', name: 'A4', pageWidth: 794, pageHeight: 1123 })
      : config.pageSize

    this.config = {
      pageSize: ps,
      margins: config.margins ?? { top: 20, bottom: 20, left: 50, right: 50 },
      pageGap: config.pageGap ?? 50,
      headerLeft: config.headerLeft ?? '',
      headerRight: config.headerRight ?? '',
      footerLeft: config.footerLeft ?? '',
      footerRight: config.footerRight ?? '',
    }

    this.scrollEl = scrollEl
    this.bufferPages = bufferPages
    this.editorEl = editor instanceof HTMLElement ? editor : editor.dom

    this.pageLayout = new PageLayout(editor, {
      pageHeight: ps.pageHeight,
      pageWidth: ps.pageWidth,
      margins: this.config.margins,
    }, 150)
  }

  /** Run or re-run layout measurement. Resolves with current page data. */
  async layout(): Promise<PageOverlayData> {
    const result = await this.pageLayout.layout()
    this.lastResult = result
    return this.computeData()
  }

  /** Start observing scroll events to track visible pages. */
  observe(): void {
    if (this.scrollHandler) return
    this.scrollHandler = () => this.onScroll()
    this.scrollEl.addEventListener('scroll', this.scrollHandler, { passive: true })
    // Initial visibility calculation
    this.updateVisible()
  }

  /** Stop observing scroll events. */
  disconnect(): void {
    if (this.scrollHandler) {
      this.scrollEl.removeEventListener('scroll', this.scrollHandler)
      this.scrollHandler = null
    }
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = 0
    }
    this.pageLayout.destroy()
  }

  /** Get current page overlay data synchronously (cached). */
  getData(): PageOverlayData {
    return {
      totalPages: this.lastResult?.pages.length ?? 1,
      visiblePages: this.lastVisible,
      config: this.config,
    }
  }

  /** Update configuration (page size, margins, etc.) — triggers re-layout. */
  async updateConfig(config: Partial<PageOverlayConfig>): Promise<PageOverlayData> {
    // Snapshot before mutating: `this.config` is edited in place, so the
    // "previous" values have to be captured first.
    const previousPageSize = this.config.pageSize
    const previousMargins = this.config.margins

    if (config.pageSize !== undefined) {
      this.config.pageSize = typeof config.pageSize === 'string'
        ? (getPageSize(config.pageSize) ?? this.config.pageSize)
        : config.pageSize
    }
    if (config.margins) {
      this.config.margins = { ...this.config.margins, ...config.margins }
    }

    // `PageLayout` reads page size and margins once, in its constructor, so it
    // only has to be rebuilt when one of them actually changed. Rebuilding on
    // presence alone would re-create the layout for header/footer-only updates.
    const sizeChanged = !samePageSize(this.config.pageSize, previousPageSize)
    const marginsChanged = !sameMargins(this.config.margins, previousMargins)
    if (sizeChanged || marginsChanged) {
      this.pageLayout.destroy()
      this.pageLayout = new PageLayout(this.editorEl, {
        pageHeight: this.config.pageSize.pageHeight,
        pageWidth: this.config.pageSize.pageWidth,
        margins: this.config.margins,
      }, 150)
    }

    if (config.pageGap !== undefined) this.config.pageGap = config.pageGap
    if (config.headerLeft !== undefined) this.config.headerLeft = config.headerLeft
    if (config.headerRight !== undefined) this.config.headerRight = config.headerRight
    if (config.footerLeft !== undefined) this.config.footerLeft = config.footerLeft
    if (config.footerRight !== undefined) this.config.footerRight = config.footerRight

    return this.layout()
  }

  // ── Private ────────────────────────────────────────────────────────────

  private onScroll(): void {
    if (this.rafId) return
    this.rafId = requestAnimationFrame(() => {
      this.rafId = 0
      this.updateVisible()
    })
  }

  private async updateVisible(): Promise<void> {
    const st = this.scrollEl.scrollTop
    if (st === this.lastScrollTop) return
    this.lastScrollTop = st

    if (!this.lastResult) {
      await this.layout()
    }

    this.computeData()
  }

  private computeData(): PageOverlayData {
    const pages = this.lastResult?.pages ?? []
    const totalPages = pages.length || 1
    const ph = this.config.pageSize.pageHeight + this.config.pageGap

    const viewportTop = this.scrollEl.scrollTop
    const viewportBottom = viewportTop + this.scrollEl.clientHeight

    const visible: VisiblePage[] = []
    const startPage = Math.max(0, Math.floor(viewportTop / ph) - this.bufferPages)
    const endPage = Math.min(totalPages, Math.ceil(viewportBottom / ph) + this.bufferPages)

    for (let i = startPage; i < endPage; i++) {
      visible.push({
        index: i,
        top: i * ph,
        height: ph,
      })
    }

    this.lastVisible = visible
    return { totalPages, visiblePages: visible, config: this.config }
  }
}
