import { test, expect, type Page } from '@playwright/test'

/**
 * Regression for #163: pasting two Google-Docs-style tracker tables inflated the
 * page count (7 breaks for ~6 pages of content) and left a ~5.100 px blank band
 * above the second source table.
 *
 * Root cause (fixed in `packages/plugins/src/tablePageSplit.ts`): the 2nd table
 * inherited the leftover of the 1st table's chunk chain as its head budget —
 * 282 px, less than one of its rows (403 px) — so `findSplitRow` returned -1,
 * the table was left UNSplit, and PaginationPlus kept inserting empty pages
 * trying to push a 2.5-page table onto a single page.
 *
 * This owns the symptom at library level: `docflow-app`'s own repro spec was
 * only the reproduction, and the library owns pagination / tablePageSplit
 * (#96). The invariants below are page-geometry invariants, so they run against
 * the demo in this repo (the review surface) instead of the app.
 *
 * The fixture is the user's real paste payload from the tracker report (Jam
 * 34b670b5 / 6a7c35d2): heading + 6-row table + h2 + 3 paragraphs + 6-row
 * table, with 6-item bullet lists inside every cell.
 */

/** Same payload the app's repro spec uses — do not "simplify" it: the tall
 *  bullet-filled rows are exactly what makes the rows ~400 px high. */
function buildTrackerPaste(): string {
  const cell = (h: string, idx = '') =>
    `<ul><li>${h}${idx} bullet one — wraps to two lines on a 200 px column.</li>` +
    `<li>${h}${idx} second bullet.</li>` +
    `<li>${h}${idx} third bullet.</li>` +
    `<li>${h}${idx} fourth bullet.</li>` +
    `<li>${h}${idx} fifth bullet.</li>` +
    `<li>${h}${idx} sixth bullet.</li></ul>`
  const styledText = (s: string) =>
    `<span style="font-size:11pt;color:rgb(0,0,0);background-color:transparent">${s}</span>`
  const sty = (h: string) =>
    `<b id="docs-internal-guid-deadbeef-0000-0000-0000-${h.replace(/\W/g, '0')}" ` +
    `style="font-weight:normal;"><h1 class="title">${styledText(h)}</h1></b>`
  const row = (label: string) =>
    `<tr><td>${styledText(label)}</td><td>${cell(label)}</td><td>${styledText('')}</td></tr>`
  const t1 = `<table border="1"><tbody>${row('Proposal')}${row('Pre-Development')}${row('Development Process')}${row('Post Development')}${row('Administration')}<tr><td>${styledText('etc')}</td><td>${cell('')}</td><td></td></tr></tbody></table>`
  const t2 = `<table border="1"><tbody>${row('Section A')}${row('Section B')}${row('Section C')}${row('Section D')}${row('Section E')}<tr><td>${styledText('etc')}</td><td>${cell('')}</td><td></td></tr></tbody></table>`
  return [
    sty('WHO - RegINA: 2-table tracker paste'),
    t1,
    '<h2>Daftar Isi</h2>',
    '<p>Project Document Tracker entry 1 — overview of the active stage.</p>',
    '<p>Project Document Tracker entry 2 — overview of the next milestone.</p>',
    '<p>Project Document Tracker entry 3 — overview of the closing stage.</p>',
    t2,
  ].join('\n')
}

async function pasteHtml(page: Page, html: string): Promise<void> {
  await page.evaluate((h) => {
    const dt = new DataTransfer()
    dt.setData('text/html', h)
    dt.setData('text/plain', 'p')
    const target = document.querySelector('.ProseMirror[contenteditable]') as HTMLElement
    if (!target) throw new Error('editor not found')
    const rect = target.getBoundingClientRect()
    target.dispatchEvent(new ClipboardEvent('paste', {
      clipboardData: dt,
      bubbles: true,
      cancelable: true,
      clientX: rect.left + 10,
      clientY: rect.top + 10,
    }))
  }, html)
}

interface PasteMetrics {
  pages: number
  pageContentPx: number
  tables: { rows: number; h: number }[]
  totalRows: number
  /** Widest vertical gap between two consecutive content blocks (px). */
  maxGapPx: number
  /** Rendered height of the content itself: block heights plus the margins
   *  between blocks that share a page. Gaps that hold a page break are page
   *  geometry (page gap + breaker), not content, so they are excluded. */
  contentPx: number
}

async function readMetrics(page: Page): Promise<PasteMetrics> {
  return page.evaluate(() => {
    const paper = document.querySelector('.docs-editor__paper') as HTMLElement
    const pm = paper.querySelector('.ProseMirror') as HTMLElement
    const pag = paper.querySelector('[data-rm-pagination]') as HTMLElement

    const pageContentPx = parseFloat(pm.style.getPropertyValue('--rm-page-content-general'))

    const tables = Array.from(pm.querySelectorAll('table')).map((t) => ({
      rows: t.querySelectorAll(':scope > tbody > tr').length,
      h: Math.round(t.getBoundingClientRect().height),
    }))

    const breakTops = Array.from(pag.querySelectorAll(':scope > .rm-page-break .breaker')).map(
      (b) => b.getBoundingClientRect().top,
    )

    // Content blocks in document order. Page-break decorations are zero-height
    // widgets, so they never sit between two blocks in the flow; filter them
    // defensively anyway.
    const blocks = Array.from(pm.children).filter(
      (el) => !el.classList.contains('rm-page-break') && !el.hasAttribute('data-rm-pagination'),
    )

    let maxGapPx = 0
    let contentPx = 0
    for (let i = 0; i < blocks.length; i++) {
      const r = blocks[i].getBoundingClientRect()
      contentPx += r.height
      if (i === 0) continue
      const prev = blocks[i - 1].getBoundingClientRect()
      const gap = Math.round(r.top - prev.bottom)
      maxGapPx = Math.max(maxGapPx, gap)
      // A page break inside the gap means this gap is page geometry.
      const hasBreak = breakTops.some((t) => t >= prev.bottom - 2 && t <= r.top + 2)
      if (!hasBreak && gap > 0) contentPx += gap
    }

    return {
      pages: pag.querySelectorAll(':scope > .rm-page-break').length,
      pageContentPx,
      tables,
      totalRows: tables.reduce((acc, t) => acc + t.rows, 0),
      maxGapPx,
      contentPx: Math.round(contentPx),
    }
  })
}

test.describe('paste: two tracker tables (#163)', () => {
  test('page count follows the content and no blank band is inserted before the 2nd table', async ({ page }) => {
    await page.goto('/')
    await page.locator('select.pg-select').first().selectOption('blank')
    await expect(page.locator('.docs-editor__paper .ProseMirror')).toBeVisible()

    await page.locator('.ProseMirror[contenteditable]').click()
    await pasteHtml(page, buildTrackerPaste())

    // The splitter runs on a deferred microtask and dispatches its own tr, and
    // PaginationPlus re-measures after that. Poll until the layout settles:
    // both source tables chunked (6 chunks of 2 rows for this payload).
    await expect(async () => {
      const m = await readMetrics(page)
      expect(m.totalRows).toBe(12)
      expect(m.tables.length).toBe(6)
    }).toPass({ timeout: 15000, intervals: [250, 500, 1000] })

    // Let the pagination pass after the last split settle.
    await page.waitForTimeout(1000)
    const m = await readMetrics(page)
    console.log('[metrics]', JSON.stringify(m))

    // INVARIANT 1 (#192): rows are never duplicated by the split.
    expect(m.totalRows).toBe(12)

    // INVARIANT 2 (#163): every chunk fits on one page. A table taller than the
    // page-content area is exactly what made PaginationPlus inflate the count.
    for (const t of m.tables) {
      expect(t.h).toBeLessThanOrEqual(Math.ceil(m.pageContentPx))
    }

    // INVARIANT 3 (#163): no blank band. The bug left ~5.100 px of nothing
    // between the last paragraph and the 2nd source table; a page boundary
    // costs at most one page gap + breaker (~340 px here), far below a page.
    expect(m.maxGapPx).toBeLessThan(m.pageContentPx)

    // INVARIANT 4 (#163): the page count tracks content fit. Pages must cover
    // the content (no page may be dropped) and may not exceed it by more than
    // one page — rounding plus the "pushes a chunk to the next page" slack. The
    // reported symptom (`29 pages` for a paste like this, 7 here) fails this.
    const neededPages = Math.ceil(m.contentPx / m.pageContentPx)
    expect(m.pages).toBeGreaterThanOrEqual(neededPages - 1)
    expect(m.pages).toBeLessThanOrEqual(neededPages + 1)
  })
})
