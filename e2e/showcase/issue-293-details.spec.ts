import { test, expect } from '@playwright/test'

test('details dialog uses live counts and closes the File menu (#293)', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => Boolean((window as unknown as { __docsEditor?: unknown }).__docsEditor))
  await expect(page.locator('#editor-toolbar-row')).toBeVisible()

  const expected = await page.evaluate(() => {
    const editor = (window as unknown as { __docsEditor: { getText: () => string } }).__docsEditor
    const text = editor.getText()
    return {
      words: text.trim() ? text.trim().split(/\s+/).length : 0,
      chars: text.length,
    }
  })
  expect(expected.words).toBeGreaterThan(0)

  const fileMenu = page.getByTestId('header-menu-panel')
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await expect(fileMenu).toBeVisible()
  await fileMenu.getByRole('button', { name: 'Details', exact: true }).click()

  await expect(page.getByTestId('details-word-count')).toBeVisible()
  await expect(page.getByTestId('details-word-count')).toHaveText(String(expected.words))
  await expect(page.getByTestId('details-char-count')).toHaveText(String(expected.chars))

  // The File dropdown must be gone once the Details dialog opens.
  await expect(fileMenu).toHaveCount(0)
})
