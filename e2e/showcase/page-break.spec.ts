import { test, expect, type Page } from '@playwright/test'

async function createBlankDocument(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('select.pg-select').first().selectOption('blank')
  await expect(page.locator('.docs-editor')).toBeVisible()
  await expect(page.locator('.docs-editor__paper .ProseMirror')).toBeVisible()
}

async function insertLongContent(page: Page, paragraphs = 80): Promise<void> {
  const longHTML = Array.from(
    { length: paragraphs },
    (_, i) => `<p>Paragraph ${i}: ${'word '.repeat(30)}</p>`,
  ).join('')

  await page.evaluate((html) => {
    const editor = (window as unknown as { __docsEditor?: { commands: { insertContent: (content: string) => boolean } } }).__docsEditor
    if (!editor) throw new Error('window.__docsEditor is not available')
    editor.commands.insertContent(html)
  }, longHTML)

  // Wait for pagination extension to recalculate page breaks
  await page.waitForTimeout(500)
}

test.describe('Page break visual', () => {
  test('renders single page for short document', async ({ page }) => {
    await createBlankDocument(page)

    const paper = page.locator('.docs-editor__paper')
    await expect(paper).toBeVisible()

    // With short content the pagination wrapper exists and there is exactly one page.
    // Scope to the paper: the layout engine renders an off-screen measurement clone
    // that also carries `[data-layout-shadow] [data-rm-pagination]`.
    const pagination = page.locator('.docs-editor__paper [data-rm-pagination]')
    await expect(pagination).toBeAttached()
    await expect(pagination).toHaveCount(1)

    const pageBreaks = pagination.locator('> .rm-page-break')
    await expect(pageBreaks).toHaveCount(1)
  })

  test('splits content into multiple pages for long document', async ({ page }) => {
    await createBlankDocument(page)
    await insertLongContent(page, 80)

    const pageBreaks = page.locator('.docs-editor__paper [data-rm-pagination] > .rm-page-break')
    await expect(pageBreaks).toHaveCount(8)
  })

  test('page container has proper padding', async ({ page }) => {
    await createBlankDocument(page)

    const paper = page.locator('.docs-editor__paper .ProseMirror')
    await expect(paper).toBeVisible()

    // PaginationPlus applies margins via CSS variables on the ProseMirror element
    const paddingLeft = await paper.evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft))
    expect(paddingLeft).toBeGreaterThan(0)
  })

  test('gutter separator appears for multi-page', async ({ page }) => {
    await createBlankDocument(page)
    await insertLongContent(page, 80)

    const gaps = page.locator('.docs-editor__paper [data-rm-pagination] .rm-pagination-gap')
    await expect(gaps.first()).toBeVisible()
  })

  test('click on paper focuses ProseMirror', async ({ page }) => {
    await createBlankDocument(page)

    await page.locator('.docs-editor__paper .ProseMirror').click()

    const isFocused = await page.evaluate(() => {
      const pm = document.querySelector('.ProseMirror')
      return pm === document.activeElement || pm?.contains(document.activeElement)
    })
    expect(isFocused).toBe(true)
  })

  test('paper has non-zero dimensions', async ({ page }) => {
    await createBlankDocument(page)

    const box = await page.locator('.docs-editor__paper').boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThan(0)
    expect(box!.height).toBeGreaterThan(0)
  })
})
