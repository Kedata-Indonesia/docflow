import { test, expect, type Page } from '@playwright/test'

/**
 * Issue #348 — the History panel was the only sidebar without a close button; the reader had
 * to re-open the menu (or press the toolbar toggle) to dismiss it.
 */

async function openBlankDocument(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('select.pg-select').first().selectOption('blank')
  await expect(page.locator('.docs-editor__paper .ProseMirror')).toBeVisible()
}

test.describe('history sidebar close button (#348)', () => {
  test.describe.configure({ timeout: 60_000 })

  test('the panel closes from its own button and still toggles from the toolbar', async ({ page }) => {
    await openBlankDocument(page)
    const panel = page.locator('.history-sidebar')
    const toggle = page.getByRole('button', { name: 'History', exact: true })

    await toggle.click()
    await expect(panel).toBeVisible()

    await page.getByRole('button', { name: 'Close history', exact: true }).click()
    await expect(panel).toHaveCount(0)

    // The toolbar toggle keeps working after closing from the panel.
    await toggle.click()
    await expect(panel).toBeVisible()
  })
})
