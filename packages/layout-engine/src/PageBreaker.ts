import type { BlockInfo, Page } from './types'

export type MeasureTextBlock = (block: BlockInfo, offset: number) => number | null

export interface SplitResult {
  current: BlockInfo
  next: BlockInfo
}

export class PageBreaker {
  constructor(private measureTextBlock: MeasureTextBlock = () => null) {}

  computePages(blocks: BlockInfo[], pageHeight: number, maxCharsPerPage?: number): Page[] {
    const pages: Page[] = []
    let currentBlocks: BlockInfo[] = []
    let currentFrom = 0
    let currentTo = 0
    let usedHeight = 0

    let i = 0
    let block: BlockInfo | undefined = blocks[0]

    while (block) {
      const blockHeight = block.bottom - block.top

      // ── Mark blocks taller than the page itself (unsplittable only) ────
      // Splittable blocks (paragraphs, headings) go through the split logic below.
      // Only unsplittable blocks (images, tables) are marked oversized and isolated.
      if (!block.canSplit && blockHeight > pageHeight) {
        block = { ...block, pageOverflow: true }
      }

      if (currentBlocks.length === 0) {
        currentFrom = block.from
      }

      // ── Force break ──────────────────────────────────────────────────────
      if (block.forceBreak && currentBlocks.length > 0) {
        pages.push({ from: currentFrom, to: currentTo, blocks: currentBlocks })
        currentBlocks = []
        usedHeight = 0
        currentFrom = block.from
        currentTo = block.from
      }

      // ── Oversized block handling ─────────────────────────────────────────
      if (block.pageOverflow) {
        if (currentBlocks.length > 0) {
          pages.push({ from: currentFrom, to: currentTo, blocks: currentBlocks })
          currentBlocks = []
          usedHeight = 0
        }
        currentBlocks = [block]
        currentFrom = block.from
        currentTo = block.to
        pages.push({ from: currentFrom, to: currentTo, blocks: currentBlocks })
        currentBlocks = []
        usedHeight = 0
        i++
        block = blocks[i]
        continue
      }

      // ── Calculate this block's VERTICAL SPAN (including CSS margins) ──
      // CSS margins are NOT included in getBoundingClientRect, but they DO
      // take up vertical space. We account for them here.
      //
      // For the FIRST block on a page, its vertical span measured from the
      // page's content origin (y=0) is:
      //   block.top (marginTop + position) + (block.bottom - block.top) height
      //   + block.marginBottom
      //   = block.bottom + block.marginBottom
      // (block.top already includes the effect of marginTop)
      //
      // For SUBSEQUENT blocks, the ADDITIONAL vertical space is the COLLAPSED
      // MARGIN GAP between blocks, plus this block's border height, plus its
      // margin-bottom:
      //   max(prevMarginBottom, thisMarginTop) + borderHeight + thisMarginBottom
      //   = (block.top - prevBlock.bottom) + (block.bottom - block.top) + marginBottom
      //   = block.bottom + marginBottom - prevBlock.bottom
      let blockSpan: number
      if (currentBlocks.length === 0) {
        // First block on the page: only its own footprint counts.
        // block.bottom is relative to the ORIGINAL document y=0, not the new
        // page. So we use the block's own height + margins instead.
        const marginTop = block.marginTop ?? 0
        const marginBottom = block.marginBottom ?? 0
        blockSpan = (block.bottom - block.top) + marginTop + marginBottom
      } else {
        const prevBlock = currentBlocks[currentBlocks.length - 1]
        const gap = Math.max(0, block.top - prevBlock.bottom) // clamp to 0 for overlapping blocks (edge case)
        blockSpan = gap + (block.bottom - block.top) + (block.marginBottom ?? 0)
      }

      // ── Check if block fits (height + optional char-count limit) ────
      const fitsInPage = usedHeight + blockSpan <= pageHeight

      // Secondary check: character-count limit
      let exceedsCharLimit = false
      if (maxCharsPerPage && fitsInPage) {
        const charsWithBlock = (currentTo - currentFrom) + (block.to - block.from)
        exceedsCharLimit = charsWithBlock > maxCharsPerPage
      }

      if (fitsInPage && !exceedsCharLimit) {
        currentBlocks.push(block)
        currentTo = block.to
        usedHeight += blockSpan
        i++
        block = blocks[i]
        continue
      }

      // ── Block doesn't fit — try splitting it ─────────────────────────────
      if (block.canSplit) {
        // remaining space in this page for the block's content.
        // This also covers the case where the block is the first one on a page
        // (currentBlocks.length === 0): remaining = pageHeight.
        const remaining = pageHeight - usedHeight
        const split = this.splitBlock(block, remaining)
        if (split) {
          currentBlocks.push(split.current)
          currentTo = split.current.to
          pages.push({
            from: currentFrom,
            to: currentTo,
            blocks: currentBlocks,
          })

          currentBlocks = []
          usedHeight = 0
          block = split.next
          continue
        }
      }

      // ── Can't split or split failed — start a new page ──────────────────
      if (currentBlocks.length > 0) {
        pages.push({ from: currentFrom, to: currentTo, blocks: currentBlocks })
        currentBlocks = []
        usedHeight = 0
      }

      currentBlocks.push(block)
      currentFrom = block.from
      currentTo = block.to
      // This block is the first on a new page — use its own footprint (not
      // the absolute bottom position which is relative to the whole document).
      usedHeight = (block.bottom - block.top) + (block.marginTop ?? 0) + (block.marginBottom ?? 0)
      i++
      block = blocks[i]
    }

    if (currentBlocks.length > 0) {
      pages.push({ from: currentFrom, to: currentTo, blocks: currentBlocks })
    }

    return pages
  }

  splitBlock(block: BlockInfo, availableHeight: number): SplitResult | null {
    const totalChars = block.to - block.from
    if (totalChars <= 0 || availableHeight <= 0) return null

    // Don't attempt to split very small blocks — the binary search won't give
    // meaningful results and it's better to let the whole block overflow
    // gracefully (it'll be clipped by overflow: hidden on the page container).
    if (totalChars < 10 || availableHeight < 20) return null

    let lo = 0
    let hi = totalChars
    let best = -1

    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2)
      const height = this.measureTextBlock(block, mid)
      if (height === null) return null

      if (height <= availableHeight) {
        best = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }

    // Don't split if we'd leave fewer than 4 chars on either side
    if (best <= 0 || best >= totalChars - 3) return null

    const currentHeight = this.measureTextBlock(block, best)
    if (currentHeight === null) return null

    const splitOffset = block.from + best
    const current: BlockInfo = {
      ...block,
      to: splitOffset,
      bottom: block.top + currentHeight,
      splitOffset,
    }
    const next: BlockInfo = {
      ...block,
      from: splitOffset,
      top: block.top + currentHeight,
      splitOffset: undefined,
    }
    return { current, next }
  }
}
