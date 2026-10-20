import { test, expect, type Page } from '@playwright/test'

/**
 * Issue #305 — the editor is a word processor, not a markdown editor: typing
 * backticks around a word must leave the text alone. The inline-code *mark* stays
 * available (pasted/received HTML still renders it), only the input rule that
 * converts `` `text` `` on the fly is gone.
 */

interface ExposedEditor {
  commands: { insertContent: (content: string) => boolean; focus: () => boolean }
}

async function openBlankDocument(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('select.pg-select').first().selectOption('blank')
  await expect(page.locator('.docs-editor__paper .ProseMirror')).toBeVisible()
}

function editor(page: Page) {
  return page.locator('.docs-editor__paper .ProseMirror')
}

test.describe('backticks stay literal (#305)', () => {
  test.describe.configure({ timeout: 60_000 })

  test('typing a backtick pair does not turn the text into inline code', async ({ page }) => {
    await openBlankDocument(page)
    const paper = editor(page)

    await paper.click()
    await page.keyboard.type('`Test Test`')

    await expect(paper.locator('code')).toHaveCount(0)
    expect((await paper.innerText()).trim()).toBe('`Test Test`')
  })

  test('inline code that arrives as HTML still renders', async ({ page }) => {
    await openBlankDocument(page)
    const paper = editor(page)

    await page.evaluate(() => {
      const instance = (window as unknown as { __docsEditor?: ExposedEditor }).__docsEditor
      if (!instance) throw new Error('window.__docsEditor is not available')
      instance.commands.insertContent('<p><code>kept</code></p>')
    })

    await expect(paper.locator('code')).toHaveCount(1)
    await expect(paper.locator('code')).toHaveText('kept')
  })
})
