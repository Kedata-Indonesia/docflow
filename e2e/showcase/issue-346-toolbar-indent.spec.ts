import { test, expect, type Page } from '@playwright/test'

/**
 * Issue #346 — indent lived only in Format ▸ Align & indent. The toolbar now has
 * increase/decrease buttons that run the same IndentExtension commands.
 */

async function openBlankDocument(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('select.pg-select').first().selectOption('blank')
  await expect(page.locator('.docs-editor__paper .ProseMirror')).toBeVisible()
}

test.describe('toolbar indent buttons (#346)', () => {
  test.describe.configure({ timeout: 60_000 })

  test('increase and decrease move the block between indent levels', async ({ page }) => {
    await openBlankDocument(page)
    const paper = page.locator('.docs-editor__paper .ProseMirror')
    const increase = page.getByTestId('toolbar-indent-increase')
    const decrease = page.getByTestId('toolbar-indent-decrease')

    await paper.click()
    await page.keyboard.type('Indent me')

    // Level 0: there is nothing to decrease.
    await expect(decrease).toBeDisabled()
    await expect(increase).toBeEnabled()

    await increase.click()
    await expect(paper.locator('p[data-indent="1"]')).toHaveCount(1)
    await expect(decrease).toBeEnabled()

    await decrease.click()
    await expect(paper.locator('p[data-indent]')).toHaveCount(0)
    await expect(decrease).toBeDisabled()
  })
})
