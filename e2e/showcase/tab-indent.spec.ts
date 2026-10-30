import { test, expect, type Page } from '@playwright/test'

/**
 * Issue #189 — Tab / Shift-Tab indentation, exercised against the demo app
 * through real key events (the bug was that the browser moved focus out of the
 * editor instead).
 */

interface ExposedEditor {
  commands: {
    insertContent: (content: string) => boolean
    setTextSelection: (pos: number) => boolean
    focus: () => boolean
  }
  state: { doc: { textContent: string } }
}

async function createBlankDocument(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('select.pg-select').first().selectOption('blank')
  await expect(page.locator('.docs-editor')).toBeVisible()
  await expect(page.locator('.docs-editor__paper .ProseMirror')).toBeVisible()
}

function editor(page: Page) {
  return page.locator('.docs-editor__paper .ProseMirror')
}

/** Insert schema-valid HTML through the exposed editor handle (as page-break.spec does). */
async function insertContent(page: Page, html: string): Promise<void> {
  await page.evaluate((content) => {
    const instance = (window as unknown as { __docsEditor?: ExposedEditor }).__docsEditor
    if (!instance) throw new Error('window.__docsEditor is not available')
    instance.commands.insertContent(content)
  }, html)
  await page.waitForTimeout(200)
}

/**
 * Put the caret at an exact document position. Clicking a code block gives a
 * browser-dependent offset, so the caret is placed through the editor handle.
 */
async function focusCaret(page: Page, pos: number): Promise<void> {
  await page.evaluate((at) => {
    const instance = (window as unknown as { __docsEditor?: ExposedEditor }).__docsEditor
    if (!instance) throw new Error('window.__docsEditor is not available')
    instance.commands.setTextSelection(at)
    instance.commands.focus()
  }, pos)
  await page.waitForTimeout(50)
}

function focusStaysInsideEditor(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const surface = document.querySelector('.ProseMirror')
    return Boolean(surface && surface.contains(document.activeElement))
  })
}

test.describe('Tab indentation (#189)', () => {
  // The demo app is served by Vite in dev mode, so the first request of a run
  // pays for the on-demand transform of the whole playground. Keep the default
  // assertions; just do not fail them on a cold compile.
  test.describe.configure({ timeout: 60_000 })

  test('Tab indents the paragraph and keeps focus in the editor', async ({ page }) => {
    await createBlankDocument(page)
    const paper = editor(page)

    await paper.click()
    await page.keyboard.type('Indent me')
    await page.keyboard.press('Tab')

    const indented = paper.locator('p[data-indent="1"]')
    await expect(indented).toHaveCount(1)
    await expect(indented).toHaveText('Indent me')

    const marginLeft = await indented.evaluate((el) => getComputedStyle(el).marginLeft)
    expect(marginLeft).toBe('48px')
    // Before the fix the browser moved focus out of the editor on Tab.
    expect(await focusStaysInsideEditor(page)).toBe(true)

    await page.keyboard.press('Tab')
    await expect(paper.locator('p[data-indent="2"]')).toHaveCount(1)

    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Shift+Tab')
    await expect(paper.locator('p[data-indent]')).toHaveCount(0)
  })

  test('Backspace at the start of an indented block steps out one level', async ({ page }) => {
    await createBlankDocument(page)
    const paper = editor(page)

    await paper.click()
    await page.keyboard.type('Outdent me')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await expect(paper.locator('p[data-indent="2"]')).toHaveCount(1)

    // Put the caret at the very start of the block — that is where Backspace has to
    // outdent instead of deleting content. (A `Home` key press does not move the caret
    // in headless Chromium, so the position is set through the editor handle; the
    // behaviour under test is Backspace, not how the caret got there.)
    await page.evaluate(() => {
      const instance = (window as unknown as { __docsEditor?: ExposedEditor }).__docsEditor
      if (!instance) throw new Error('window.__docsEditor is not available')
      instance.commands.setTextSelection(1)
    })
    await page.keyboard.press('Backspace')
    await expect(paper.locator('p[data-indent="1"]')).toHaveCount(1)
    expect((await paper.locator('p').first().innerText()).trim()).toBe('Outdent me')

    await page.keyboard.press('Backspace')
    await expect(paper.locator('p[data-indent]')).toHaveCount(0)
    expect((await paper.locator('p').first().innerText()).trim()).toBe('Outdent me')
  })

  test('Tab nests a list item instead of indenting its text', async ({ page }) => {
    await createBlankDocument(page)
    const paper = editor(page)

    await paper.click()
    await page.keyboard.type('First item')
    await page.keyboard.press('Enter')
    await page.keyboard.type('- Second item')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Third item')
    await page.keyboard.press('Tab')

    await expect(paper.locator('ul ul')).toHaveCount(1)
    // The list item moved down a level; its paragraph keeps no block indent.
    await expect(paper.locator('li p[data-indent]')).toHaveCount(0)
  })

  test('Tab inside a code block inserts a tab at the caret', async ({ page }) => {
    await createBlankDocument(page)
    const paper = editor(page)

    await insertContent(page, '<pre><code>const a = 1</code></pre>')
    const code = paper.locator('pre code').first()
    // Code block content starts at document position 1; put the caret after "const ".
    await focusCaret(page, 1 + 'const '.length)
    await page.keyboard.press('Tab')

    expect(await code.evaluate((el) => el.textContent)).toBe('const \ta = 1')
    await expect(paper.locator('pre[data-indent]')).toHaveCount(0)
    expect(await focusStaysInsideEditor(page)).toBe(true)
  })

  test('Shift-Tab removes the leading whitespace of a code line', async ({ page }) => {
    await createBlankDocument(page)
    const paper = editor(page)

    await insertContent(page, '<pre><code>\tconst a = 1</code></pre>')
    const code = paper.locator('pre code').first()
    await focusCaret(page, 1)
    await page.keyboard.press('Shift+Tab')

    expect(await code.evaluate((el) => el.textContent)).toBe('const a = 1')
  })

  test('Format ▸ Align & indent exposes Indent / Outdent actions', async ({ page }) => {
    await createBlankDocument(page)
    const paper = editor(page)

    await paper.click()
    await page.keyboard.type('Menu indent')

    // Choosing an item closes the whole menu bar, so the panel is reopened from
    // "Format" every time. Regression guard for #461: the panel stays visible
    // during its leave transition, so an `isVisible()` shortcut here skipped the
    // reopen and clicked an item that was already unmounting — a no-op that
    // looked like a broken Outdent.
    const openAlignIndent = async (): Promise<void> => {
      // Wait for the previous panel's leave transition to finish; otherwise the
      // locator can resolve to the panel that is unmounting (see #461).
      await expect(page.locator('[data-testid="header-menu-panel"]')).toHaveCount(0)
      await page.locator('nav button', { hasText: 'Format' }).first().click()
      const trigger = page.locator('nav button', { hasText: 'Align & indent' }).first()
      await expect(trigger).toBeVisible()
      // A previous open leaves the pointer inside the (now unmounted) sub-panel,
      // so reset the hover chain before hovering the trigger again.
      await page.mouse.move(4, 4)
      await trigger.hover()
      await expect(page.locator('nav button', { hasText: 'Increase indent' }).first()).toBeVisible()
    }

    await openAlignIndent()
    await page.locator('nav button', { hasText: 'Increase indent' }).first().click()
    await expect(paper.locator('p[data-indent="1"]')).toHaveCount(1)

    await openAlignIndent()
    await page.locator('nav button', { hasText: 'Decrease indent' }).first().click()
    await expect(paper.locator('p[data-indent]')).toHaveCount(0)
  })
})
