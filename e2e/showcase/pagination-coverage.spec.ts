import { test, expect, type Page } from '@playwright/test'

/**
 * Regression for #19: pagination must cover the whole document, not freeze on a
 * tall last block. The "Long report + footnotes" preset ends with an ordered
 * list taller than the page content area — the shape that used to stop
 * `calculatePageCount` early, leaving the tail (and its footnotes) with no page.
 *
 * Metrics are read from the visible paper only; the layout engine's off-screen
 * measurement clone (`[data-layout-shadow]`) also renders breakers.
 */

interface PaginationMetrics {
  pages: number
  refsBeyondLastBreaker: number
  footnoteItemsPerPage: number[]
  contentOverflowPx: number
}

async function loadLongPreset(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.locator('.docs-editor__paper .tiptap')).toBeVisible()
  await page.locator('select.pg-select').first().selectOption('long')
  await expect(page.locator('.docs-editor__paper .rm-page-break').first()).toBeAttached()
  // let the pagination + footnote passes settle
  await page.waitForTimeout(800)
}

async function readMetrics(page: Page): Promise<PaginationMetrics> {
  return page.evaluate(() => {
    const paper = document.querySelector('.docs-editor__paper') as HTMLElement
    const breaks = Array.from(paper.querySelectorAll('.rm-page-break'))
    const breakerTops = breaks.map((pb) => {
      const b = pb.querySelector('.breaker')
      return b ? b.getBoundingClientRect().top : Number.POSITIVE_INFINITY
    })
    const refTops = Array.from(paper.querySelectorAll('.docs-footnote-ref')).map(
      (r) => r.getBoundingClientRect().top,
    )
    const lastBreaker = breaks[breaks.length - 1]?.querySelector('.breaker')
    const lastBreakerBottom = lastBreaker
      ? lastBreaker.getBoundingClientRect().bottom
      : Number.POSITIVE_INFINITY

    const contentBottom = Math.max(
      ...Array.from((paper.querySelector('.tiptap') as HTMLElement).children)
        .filter(
          (c) =>
            !c.hasAttribute('data-rm-pagination') && !c.classList.contains('rm-page-break'),
        )
        .map((c) => c.getBoundingClientRect().bottom),
    )

    return {
      pages: breaks.length,
      refsBeyondLastBreaker: refTops.filter((t) => t > (breakerTops[breakerTops.length - 1] ?? Infinity))
        .length,
      footnoteItemsPerPage: breaks.map((pb) => pb.querySelectorAll('.docs-footnote-item').length),
      contentOverflowPx: Math.max(0, Math.round(contentBottom - lastBreakerBottom)),
    }
  })
}

test.describe('#19 pagination coverage', () => {
  test('a tall final block grows the page count instead of freezing it', async ({ page }) => {
    await loadLongPreset(page)
    const m = await readMetrics(page)

    // Frozen at 3 before the fix; the content needs 4.
    expect(m.pages).toBeGreaterThanOrEqual(4)
    // No content (and therefore no footnote ref) may spill past the last page.
    expect(m.contentOverflowPx).toBeLessThanOrEqual(2)
    expect(m.refsBeyondLastBreaker).toBe(0)
  })

  test('footnotes spread across pages instead of piling on the last one', async ({ page }) => {
    await loadLongPreset(page)
    const m = await readMetrics(page)

    const total = m.footnoteItemsPerPage.reduce((a, b) => a + b, 0)
    const lastPage = m.footnoteItemsPerPage[m.footnoteItemsPerPage.length - 1]

    expect(total).toBeGreaterThan(0)
    // The bug stacked 9 of the list footnotes on the final page; the fix leaves 1.
    expect(lastPage).toBeLessThan(5)
    // More than one page carries footnotes (they are anchored through the doc).
    expect(m.footnoteItemsPerPage.filter((n) => n > 0).length).toBeGreaterThan(1)
  })
})
