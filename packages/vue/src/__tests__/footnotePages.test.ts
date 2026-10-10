/**
 * `assignFootnotePages` — placing footnote bodies onto pages.
 *
 * The important case is real (#19): when pagination has not covered the whole
 * document yet, references near the end sit past the last page break. The old
 * rule clamped them all onto the last page — every footnote stacked on the final
 * page while the text ran on for several more pages. They are now reported as
 * `deferred` so the caller can retry once pagination grows.
 *
 * The geometry below mirrors the real document: a 978px pitch with a 286px break
 * area under each page (the first page starts at 1036).
 */
import { describe, expect, it } from 'vitest'

import { assignFootnotePages, DEFERRED_PAGE } from '../utils/footnotePages.js'

const TOPS = [1036, 2014, 2992]
const BOTTOMS = [1322, 2300, 3278]

describe('assignFootnotePages', () => {
  it('assigns a ref to the page whose break area starts below it', () => {
    // Legacy semantics preserved: a ref above the first page's break area → page 0.
    const { pages, deferred } = assignFootnotePages([500, 1200, 2500], TOPS, BOTTOMS)
    expect(pages).toEqual([0, 1, 2])
    expect(deferred).toBe(0)
  })

  it('keeps a ref inside the last page on the last page', () => {
    const { pages, deferred } = assignFootnotePages([3000, 3278], TOPS, BOTTOMS)
    expect(pages).toEqual([2, 2])
    expect(deferred).toBe(0)
  })

  // Regression for the "page 6" bug: a ref past the last page is not clamped to
  // the last page, but flagged for a retry once pagination grows.
  it('flags a ref past the last page as deferred, not clamped to the last page', () => {
    const { pages, deferred } = assignFootnotePages([500, 9003, 9207], TOPS, BOTTOMS)
    expect(pages).toEqual([0, DEFERRED_PAGE, DEFERRED_PAGE])
    expect(deferred).toBe(2)
  })

  it('with no pages at all, everything is deferred', () => {
    const { pages, deferred } = assignFootnotePages([10, 20], [], [])
    expect(pages).toEqual([DEFERRED_PAGE, DEFERRED_PAGE])
    expect(deferred).toBe(2)
  })

  it('with a single page, a ref inside it lands there and one outside is deferred', () => {
    const { pages, deferred } = assignFootnotePages([500, 5000], [1036], [1322])
    expect(pages).toEqual([0, DEFERRED_PAGE])
    expect(deferred).toBe(1)
  })

  it('the result order follows the ref order', () => {
    const { pages } = assignFootnotePages([5000, 500, 2500], TOPS, BOTTOMS)
    expect(pages).toEqual([DEFERRED_PAGE, 0, 2])
  })
})
