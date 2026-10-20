import { expect, test, type Page } from '@playwright/test'

/**
 * Issue #144 — the toolbar zoom control.
 *
 * The important guarantees are: (1) the paper scales visually while the layout
 * stays at 100 %, (2) pagination does not multiply the page count (the patched
 * PaginationPlus normalizes its rect math through `--docflow-zoom`), (3) the
 * ruler and scroll area follow the scaled paper, and (4) virtual pages pin the
 * zoom back to 100 %.
 */

interface ZoomState {
  zoom: string
  layoutWidth: number
  layoutHeight: number
  visualWidth: number
  visualHeight: number
  visualLeft: number
  outerWidth: number
  outerHeight: number
  pages: number
  rulerWidth: number | null
  rulerLeft: number | null
  scrollWidth: number
  clientWidth: number
  scrollLeft: number
}

const readState = (page: Page): Promise<ZoomState> =>
  page.evaluate(() => {
    const paper = document.querySelector('.docs-editor__paper') as HTMLElement
    const inner = document.querySelector('.docs-editor-zoom__inner') as HTMLElement
    const outer = document.querySelector('.docs-editor-zoom') as HTMLElement
    const pagination = paper.querySelector('[data-rm-pagination]')
    const ruler = document.querySelector('.docs-editor-ruler > div') as HTMLElement | null
    const scroll = document.querySelector('.docs-editor-scroll') as HTMLElement
    const pr = paper.getBoundingClientRect()
    const or = outer.getBoundingClientRect()
    const rr = ruler?.getBoundingClientRect()
    return {
      zoom: getComputedStyle(inner).getPropertyValue('--docflow-zoom').trim(),
      layoutWidth: paper.offsetWidth,
      layoutHeight: paper.offsetHeight,
      visualWidth: pr.width,
      visualHeight: pr.height,
      visualLeft: pr.left,
      outerWidth: or.width,
      outerHeight: or.height,
      pages: pagination ? pagination.children.length : 0,
      rulerWidth: rr?.width ?? null,
      rulerLeft: rr?.left ?? null,
      scrollWidth: scroll.scrollWidth,
      clientWidth: scroll.clientWidth,
      scrollLeft: scroll.scrollLeft,
    }
  })

const applyZoom = async (page: Page, percent: number): Promise<void> => {
  await page.getByTestId('toolbar-zoom').click()
  await page
    .getByTestId('toolbar-zoom-menu')
    .getByRole('button', { name: `${percent}%`, exact: true })
    .click()
  await expect(page.getByTestId('toolbar-zoom')).toContainText(`${percent}%`)
  await expect
    .poll(async () => (await readState(page)).zoom)
    .toBe((percent / 100).toString())
  // Let the pagination transaction and the ruler's rAF measurement settle.
  await page.waitForTimeout(400)
}

test.describe('toolbar zoom (#144)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as unknown as { __docsEditor?: unknown }).__docsEditor))
    // The playground persists the zoom; start every test at the default.
    await page.evaluate(() => window.localStorage.removeItem('docflow.playground.zoom'))
    await page.reload()
    await page.waitForFunction(() => Boolean((window as unknown as { __docsEditor?: unknown }).__docsEditor))
    await page.waitForFunction(() => {
      const paper = document.querySelector('.docs-editor__paper')
      const pagination = paper?.querySelector('[data-rm-pagination]')
      return Boolean(pagination && pagination.children.length > 0)
    })
    // The initial pagination transaction settles a frame or two after the page
    // wrapper appears; read a stable layout before capturing the baseline.
    await page.waitForTimeout(500)
  })

  test('scales the paper visually without changing layout or page count', async ({ page }) => {
    const base = await readState(page)
    expect(base.pages).toBeGreaterThan(0)
    expect(base.zoom).toBe('1')
    expect(base.visualWidth).toBeCloseTo(base.layoutWidth, 0)

    await applyZoom(page, 150)
    const at150 = await readState(page)
    expect(at150.layoutWidth).toBe(base.layoutWidth)
    expect(at150.layoutHeight).toBe(base.layoutHeight)
    expect(at150.visualWidth).toBeCloseTo(base.layoutWidth * 1.5, 0)
    expect(at150.visualHeight).toBeCloseTo(base.layoutHeight * 1.5, 0)
    expect(at150.outerWidth).toBeCloseTo(at150.visualWidth, 0)
    expect(at150.outerHeight).toBeCloseTo(at150.visualHeight, 0)
    // The patched pagination must not multiply the page count by the zoom.
    expect(at150.pages).toBe(base.pages)

    await applyZoom(page, 200)
    const at200 = await readState(page)
    expect(at200.visualWidth).toBeCloseTo(base.layoutWidth * 2, 0)
    expect(at200.pages).toBe(base.pages)
    expect(at200.scrollWidth).toBeGreaterThan(at200.clientWidth)

    await applyZoom(page, 50)
    const at50 = await readState(page)
    expect(at50.visualWidth).toBeCloseTo(base.layoutWidth * 0.5, 0)
    expect(at50.visualHeight).toBeCloseTo(base.layoutHeight * 0.5, 0)
    expect(at50.pages).toBe(base.pages)
    expect(at50.scrollWidth).toBeLessThanOrEqual(at50.clientWidth + 1)

    await applyZoom(page, 100)
    const restored = await readState(page)
    expect(restored.visualWidth).toBeCloseTo(base.visualWidth, 0)
    expect(restored.pages).toBe(base.pages)
  })

  test('keeps the ruler over the scaled paper, including horizontal scroll', async ({ page }) => {
    await applyZoom(page, 200)
    const before = await readState(page)
    expect(before.rulerWidth).not.toBeNull()
    expect(before.rulerWidth as number).toBeCloseTo(before.visualWidth, 0)
    expect(Math.abs((before.rulerLeft as number) - before.visualLeft)).toBeLessThanOrEqual(1)

    await page.evaluate(() => {
      const scroll = document.querySelector('.docs-editor-scroll') as HTMLElement
      scroll.scrollLeft = 200
    })
    await expect
      .poll(async () => {
        const state = await readState(page)
        return Math.abs((state.rulerLeft as number) - state.visualLeft)
      })
      .toBeLessThanOrEqual(1)
  })

  test('resets the transform for print', async ({ page }) => {
    await applyZoom(page, 150)
    await page.emulateMedia({ media: 'print' })
    const transform = await page
      .locator('.docs-editor-zoom__inner')
      .evaluate((el) => getComputedStyle(el).transform)
    expect(transform).toBe('none')
    await page.emulateMedia({ media: 'screen' })
  })

  test('pins the zoom to 100 % while virtual pages are on', async ({ page }) => {
    await applyZoom(page, 150)
    const virtualToggle = page
      .locator('label.pg-check')
      .filter({ hasText: 'virtualPages' })
      .locator('input')
    await virtualToggle.check()

    await expect(page.getByTestId('toolbar-zoom')).toBeDisabled()
    await expect(page.getByTestId('toolbar-zoom')).toContainText('100%')
    await expect.poll(async () => (await readState(page)).zoom).toBe('1')

    await virtualToggle.uncheck()
    await expect(page.getByTestId('toolbar-zoom')).toBeEnabled()
  })

  test('persists the host-owned zoom across reloads in the playground', async ({ page }) => {
    await applyZoom(page, 125)
    await page.reload()
    await page.waitForFunction(() => Boolean((window as unknown as { __docsEditor?: unknown }).__docsEditor))
    await expect(page.getByTestId('toolbar-zoom')).toContainText('125%')
    await expect.poll(async () => (await readState(page)).zoom).toBe('1.25')
  })
})
