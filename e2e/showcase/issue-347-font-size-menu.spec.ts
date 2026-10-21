import { test, expect, type Page } from '@playwright/test'

/**
 * Issue #347 — the size field could only be typed or stepped. Focusing it now opens the
 * preset list; picking an entry applies it, and typing/stepping still work.
 */

async function openBlankDocument(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('select.pg-select').first().selectOption('blank')
  await expect(page.locator('.docs-editor__paper .ProseMirror')).toBeVisible()
}

test.describe('font size preset menu (#347)', () => {
  test.describe.configure({ timeout: 60_000 })

  test('picking a preset applies that size to what is typed next', async ({ page }) => {
    await openBlankDocument(page)
    const paper = page.locator('.docs-editor__paper .ProseMirror')
    const field = page.getByTestId('toolbar-font-size-field')

    // Apply to existing text: that is the case where the toolbar can report the new size.
    await paper.click()
    await page.keyboard.type('Size me')
    await page.keyboard.press('ControlOrMeta+a')
    await field.click()

    const menu = page.getByRole('listbox')
    await expect(menu).toBeVisible()

    await page.getByTestId('toolbar-font-size-option').filter({ hasText: /^24$/ }).click()
    await expect(menu).toHaveCount(0)
    await expect(field).toHaveValue('24')

    const size = await paper.locator('span[style*="font-size"]').first().evaluate((el) => getComputedStyle(el).fontSize)
    expect(size).toBe('24px')

    // The list still marks the current size as selected.
    await field.click()
    await expect(page.getByRole('option', { name: '24', exact: true })).toHaveAttribute('aria-selected', 'true')
  })
})
