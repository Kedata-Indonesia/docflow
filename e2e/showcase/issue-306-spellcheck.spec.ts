import { test, expect, type Page } from '@playwright/test'

/**
 * Issue #306 — the toolbar's spelling button used to have no click handler at all.
 * It now toggles the browser spell checker for the editable surface and reports its
 * state via aria-pressed (nothing here can assert what the browser underlines, so the
 * contract under test is the attribute the spell checker reads).
 */
async function openBlankDocument(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('select.pg-select').first().selectOption('blank')
  await expect(page.locator('.docs-editor__paper .ProseMirror')).toBeVisible()
}

test.describe('spell check toggle (#306)', () => {
  test.describe.configure({ timeout: 60_000 })

  test('the spelling button toggles spellcheck on the editor', async ({ page }) => {
    await openBlankDocument(page)

    const paper = page.locator('.docs-editor__paper .ProseMirror')
    const button = page.getByTestId('toolbar-spelling')

    await expect(button).toHaveAttribute('aria-pressed', 'true')
    await expect(paper).not.toHaveAttribute('spellcheck', 'false')

    await button.click()
    await expect(button).toHaveAttribute('aria-pressed', 'false')
    await expect(paper).toHaveAttribute('spellcheck', 'false')

    await button.click()
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    await expect(paper).toHaveAttribute('spellcheck', 'true')
  })
})
