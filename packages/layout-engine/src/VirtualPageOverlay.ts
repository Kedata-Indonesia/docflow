import { PageLayout, type EditorLike } from './PageLayout'
import {
  resolveOverlayConfig,
  resolvePageSize,
  sameMargins,
  samePageSize,
  type PageOverlayConfig,
  type PageOverlayData,
  type ResolvedOverlayConfig,
  type VisiblePage,
} from './pageOverlayConfig'
import type { LayoutResult } from './types'
import { computeVisiblePages, sameVisiblePages } from './visibleWindow'

export type {
  PageOverlayConfig,
  PageOverlayData,
  ResolvedOverlayConfig,
  VisiblePage,
} from './pageOverlayConfig'

/** Throttle handed to `PageLayout` (ms) — layout is measured at most this often. */
const LAYOUT_THROTTLE_MS = 150

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
 *
 * Config resolution lives in `./pageOverlayConfig` and the visible-window math in
 * `./visibleWindow`, so this class only owns the lifecycle.
 */
export class VirtualPageOverlay {
  pageLayout: PageLayout
  /**
   * Pushed whenever the page count or the visible window changes. Consumers use
   * this instead of polling `getData()` on a timer (issue #376).
   */
  onVisibleChange?: (data: PageOverlayData) => void

  private config: ResolvedOverlayConfig
  private scrollEl: HTMLElement
  private editorEl: HTMLElement
  private bufferPages: number
  private lastResult: LayoutResult | null = null
  private lastVisible: VisiblePage[] = []
  private lastTotalPages = 0
  private lastScrollTop = -1
  private scrollHandler: (() => void) | null = null
  private rafId = 0

  constructor(
    editor: EditorLike | HTMLElement,
    config: PageOverlayConfig,
    scrollEl: HTMLElement,
    bufferPages = 2,
  ) {
    this.config = resolveOverlayConfig(config)
    this.scrollEl = scrollEl
    this.bufferPages = bufferPages
    this.editorEl = editor instanceof HTMLElement ? editor : editor.dom
    this.pageLayout = this.createPageLayout(this.editorEl)
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
      this.config.pageSize = resolvePageSize(config.pageSize, this.config.pageSize)
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
      this.pageLayout = this.createPageLayout(this.editorEl)
    }

    if (config.pageGap !== undefined) this.config.pageGap = config.pageGap
    if (config.headerLeft !== undefined) this.config.headerLeft = config.headerLeft
    if (config.headerRight !== undefined) this.config.headerRight = config.headerRight
    if (config.footerLeft !== undefined) this.config.footerLeft = config.footerLeft
    if (config.footerRight !== undefined) this.config.footerRight = config.footerRight

    return this.layout()
  }

  // ── Private ────────────────────────────────────────────────────────────

  /** `PageLayout` bakes page size and margins in, so a rebuild means a new instance. */
  private createPageLayout(editor: EditorLike | HTMLElement): PageLayout {
    return new PageLayout(
      editor,
      {
        pageHeight: this.config.pageSize.pageHeight,
        pageWidth: this.config.pageSize.pageWidth,
        margins: this.config.margins,
      },
      LAYOUT_THROTTLE_MS,
    )
  }

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
    const visiblePages = computeVisiblePages({
      totalPages,
      pageHeight: this.config.pageSize.pageHeight,
      pageGap: this.config.pageGap,
      bufferPages: this.bufferPages,
      scrollTop: this.scrollEl.scrollTop,
      viewportHeight: this.scrollEl.clientHeight,
    })

    const changed =
      totalPages !== this.lastTotalPages || !sameVisiblePages(visiblePages, this.lastVisible)

    this.lastVisible = visiblePages
    this.lastTotalPages = totalPages
    const result = { totalPages, visiblePages, config: this.config }
    if (changed) this.onVisibleChange?.(result)
    return result
  }
}
