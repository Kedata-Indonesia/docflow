import { describe, expect, it } from 'vitest'
import { PageBreaker } from '../PageBreaker'
import type { BlockInfo } from '../types'

/**
 * Create a block with realistic positional data.
 * In a real ProseMirror layout, each block sits below the previous one with
 * inter-block margins. We simulate this by stacking blocks vertically:
 * each block's `top` = previous block's `bottom` + collapsedMargin, and
 * `bottom` = `top + height`.
 *
 * @param from        ProseMirror document position (start)
 * @param to          ProseMirror document position (end)
 * @param height      Border-box height of the block (px)
 * @param options     Overrides
 * @param prevBottom  Previous block's bottom to position this block below it
 */
function makeBlock(
  from: number,
  to: number,
  height: number,
  options: Partial<BlockInfo> & { prevBottom?: number } = {},
): BlockInfo {
  const prevBottom = options.prevBottom ?? 0
  const marginTop = options.marginTop ?? 0
  const marginBottom = options.marginBottom ?? 0
  const collapsedGap = marginTop // simplified: first-block margin, assumes prev margin is accounted
  const top = prevBottom + collapsedGap
  const bottom = top + height
  const cleanOptions = { ...options }
  delete cleanOptions.prevBottom
  return {
    nodeType: 'paragraph',
    from,
    to,
    top,
    bottom,
    canSplit: true,
    marginTop,
    marginBottom,
    ...cleanOptions,
  }
}

describe('PageBreaker', () => {
  it('packs blocks greedily into pages', () => {
    const blocks: BlockInfo[] = [
      makeBlock(0, 10, 40, { prevBottom: 0 }),
      makeBlock(10, 20, 40, { prevBottom: 40 }),
      makeBlock(20, 30, 40, { prevBottom: 80 }),
    ]

    const breaker = new PageBreaker()
    const pages = breaker.computePages(blocks, 100)

    expect(pages).toHaveLength(2)
    expect(pages[0].blocks).toHaveLength(2)
    expect(pages[0].from).toBe(0)
    expect(pages[0].to).toBe(20)
    expect(pages[1].blocks).toHaveLength(1)
    expect(pages[1].from).toBe(20)
    expect(pages[1].to).toBe(30)
  })

  it('starts a new page when forceBreak is true', () => {
    const blocks: BlockInfo[] = [
      makeBlock(0, 10, 30, { prevBottom: 0 }),
      makeBlock(10, 20, 30, { prevBottom: 30, forceBreak: true }),
      makeBlock(20, 30, 30, { prevBottom: 60 }),
    ]

    const breaker = new PageBreaker()
    const pages = breaker.computePages(blocks, 100)

    expect(pages).toHaveLength(2)
    expect(pages[0].blocks).toHaveLength(1)
    expect(pages[0].to).toBe(10)
    expect(pages[1].blocks).toHaveLength(2)
    expect(pages[1].from).toBe(10)
  })

  it('moves non-splittable blocks whole to the next page', () => {
    const blocks: BlockInfo[] = [
      makeBlock(0, 10, 60, { prevBottom: 0 }),
      makeBlock(10, 20, 60, { prevBottom: 60, nodeType: 'image', canSplit: false }),
    ]

    const breaker = new PageBreaker()
    const pages = breaker.computePages(blocks, 100)

    expect(pages).toHaveLength(2)
    expect(pages[0].blocks).toHaveLength(1)
    expect(pages[1].blocks[0].nodeType).toBe('image')
  })

  it('splits text blocks that exceed remaining height', () => {
    const blocks: BlockInfo[] = [makeBlock(0, 20, 100, { prevBottom: 0 })]

    const measure = (block: BlockInfo, offset: number) => {
      return (offset / (block.to - block.from)) * (block.bottom - block.top)
    }

    const breaker = new PageBreaker(measure)
    const pages = breaker.computePages(blocks, 60)

    expect(pages).toHaveLength(2)
    expect(pages[0].blocks[0].to).toBe(12)
    expect(pages[0].blocks[0].splitOffset).toBe(12)
    expect(pages[1].blocks[0].from).toBe(12)
    expect(pages[1].blocks[0].splitOffset).toBeUndefined()
  })

  it('falls back to moving whole block when splitting fails', () => {
    const blocks: BlockInfo[] = [
      makeBlock(0, 10, 60, { prevBottom: 0 }),
      makeBlock(10, 20, 60, { prevBottom: 60, canSplit: true }),
    ]

    const breaker = new PageBreaker(() => null)
    const pages = breaker.computePages(blocks, 100)

    expect(pages).toHaveLength(2)
    expect(pages[0].blocks).toHaveLength(1)
    expect(pages[1].blocks).toHaveLength(1)
  })

  it('places an oversized block alone on a page when it cannot fit', () => {
    const blocks: BlockInfo[] = [makeBlock(0, 10, 200, { prevBottom: 0, canSplit: false })]

    const breaker = new PageBreaker()
    const pages = breaker.computePages(blocks, 100)

    expect(pages).toHaveLength(1)
    expect(pages[0].blocks).toHaveLength(1)
  })

  it('splits a text block across multiple pages when it is taller than one page', () => {
    const blocks: BlockInfo[] = [makeBlock(0, 30, 250, { prevBottom: 0 })]

    const measure = (block: BlockInfo, offset: number) => {
      return (offset / (block.to - block.from)) * (block.bottom - block.top)
    }

    const breaker = new PageBreaker(measure)
    const pages = breaker.computePages(blocks, 100)

    expect(pages.length).toBeGreaterThanOrEqual(2)
    expect(pages[0].blocks[0].to).toBeLessThan(30)
  })

  it('accounts for CSS margins when packing blocks into pages', () => {
    // Blocks with 8px margins: each block's own footprint = 20+8+8 = 36px.
    // Inter-block collapsed margin: max(8,8)=8px.
    // With pageHeight=100:
    //   Block 0: first-block span = (20-0)+8+8 = 36, used=36
    //   Block 1: gap=max(8,8)=8, span=8+(36-...)+8 = 36, used=72
    //   Block 2: gap=8, span=36, used=108 > 100 → page 1
    //   Block 2 on page 1: span=20+8+8=36, used=36
    //   Block 3 on page 1: gap=8, span=36, used=72
    // Result: 2 pages with 2 blocks each (72px used per page)
    const blocks: BlockInfo[] = [
      makeBlock(0, 5, 20, { prevBottom: 0, marginTop: 8, marginBottom: 8 }),
      makeBlock(5, 10, 20, { prevBottom: 28, marginTop: 8, marginBottom: 8 }),
      makeBlock(10, 15, 20, { prevBottom: 56, marginTop: 8, marginBottom: 8 }),
      makeBlock(15, 20, 20, { prevBottom: 84, marginTop: 8, marginBottom: 8 }),
    ]

    const breaker = new PageBreaker()
    const pages = breaker.computePages(blocks, 100)

    expect(pages).toHaveLength(2)
    expect(pages[0].blocks).toHaveLength(2)
    expect(pages[1].blocks).toHaveLength(2)
  })

  it('stores absolute splitOffset for split blocks', () => {
    const blocks: BlockInfo[] = [makeBlock(100, 120, 100, { prevBottom: 0 })]

    const measure = (block: BlockInfo, offset: number) => {
      return (offset / (block.to - block.from)) * (block.bottom - block.top)
    }

    const breaker = new PageBreaker(measure)
    const pages = breaker.computePages(blocks, 60)

    expect(pages).toHaveLength(2)
    expect(pages[0].blocks[0].from).toBe(100)
    expect(pages[0].blocks[0].to).toBe(112)
    expect(pages[0].blocks[0].splitOffset).toBe(112)
    expect(pages[1].blocks[0].from).toBe(112)
    expect(pages[1].blocks[0].to).toBe(120)
  })
})
