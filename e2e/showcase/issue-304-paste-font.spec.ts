import { test, expect, type Page } from '@playwright/test'

/**
 * Issue #304 — pasting text from another Docflow document must keep its font. The unit
 * tests pin the sanitizer whitelist; this one goes through the real paste pipeline to
 * prove the marks survive (the sanitizer used to drop font-family/font-size on the way in,
 * so no font mark was ever created).
 */

const DOCFLOW_HTML =
  '<p><span style="font-family: Courier New; font-size: 30pt">Test</span></p>'

async function openBlankDocument(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('select.pg-select').first().selectOption('blank')
  await expect(page.locator('.docs-editor__paper .ProseMirror')).toBeVisible()
}

test.describe('font survives a Docflow-to-Docflow paste (#304)', () => {
  test.describe.configure({ timeout: 60_000 })

  test('pasted text keeps font family and size', async ({ page }) => {
    await openBlankDocument(page)
    const paper = page.locator('.docs-editor__paper .ProseMirror')
    await paper.click()

    await page.evaluate((html) => {
      const target = document.querySelector('.docs-editor__paper .ProseMirror')
      if (!target) throw new Error('editor surface not found')
      const data = new DataTransfer()
      data.setData('text/html', html)
      data.setData('text/plain', 'Test')
      target.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      )
    }, DOCFLOW_HTML)

    const span = paper.locator('span[style*="font-family"]')
    await expect(span).toHaveCount(1)
    await expect(span).toHaveText('Test')

    const font = await span.evaluate((el) => getComputedStyle(el).fontFamily)
    expect(font).toContain('Courier New')
    const size = await span.evaluate((el) => getComputedStyle(el).fontSize)
    expect(size).toBe('40px') // 30pt
  })
})
