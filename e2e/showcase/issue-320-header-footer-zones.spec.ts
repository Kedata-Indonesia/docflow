import { test, expect, type Page } from '@playwright/test'

/**
 * Issue #320 — "click the header/footer area to edit it", Google Docs style.
 *
 * The generated widgets only cover their text box (the first-page header is absolutely
 * positioned on its text, the footer ends before the bottom margin), so the hit area has to be
 * the widget rect *plus* the page margin. Before the fix the handler also bailed out on every
 * click inside the editable surface, so the margin bands never opened anything at all.
 *
 * Every coordinate below is derived from the measured rects, so the test keeps checking the
 * geometry rather than a hardcoded offset.
 */

async function openBlankDocument(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('select.pg-select').first().selectOption('blank')
  await expect(page.locator('.docs-editor__paper .ProseMirror')).toBeVisible()
  await page.locator('.docs-editor__paper').click()
  await page.keyboard.type('Body line one')
}

type Rect = { top: number; bottom: number }

async function rectOf(page: Page, selector: string): Promise<Rect> {
  const rect = await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { top: Math.round(r.top), bottom: Math.round(r.bottom) }
  }, selector)
  expect(rect, `${selector} harus ada`).not.toBeNull()
  return rect as Rect
}

/** Which inline editor is open right now — 'header', 'footer' or 'none'. */
function openSlot(page: Page): Promise<string> {
  return page.evaluate(() => {
    const overlay = document.querySelector('.rm-header-edit-overlay, .rm-footer-edit-overlay')
    if (!overlay) return 'none'
    return overlay.className.includes('footer') ? 'footer' : 'header'
  })
}

async function closeSlot(page: Page): Promise<void> {
  if ((await openSlot(page)) === 'none') return
  // Escape is not wired to the inline editor; an outside click on the gutter commits and closes it.
  await page.mouse.click(60, 300)
  await expect.poll(() => openSlot(page)).toBe('none')
}

/** Click at viewport (x, y) and report which editor opened (then close it). */
async function clickAndRead(page: Page, y: number): Promise<string> {
  await closeSlot(page)
  await page.mouse.click(700, y)
  await page.waitForTimeout(150)
  const opened = await openSlot(page)
  await closeSlot(page)
  return opened
}

test.describe('header/footer margin hit areas (#320)', () => {
  test.describe.configure({ timeout: 90_000 })

  test('the header band above the text opens the header editor', async ({ page }) => {
    await openBlankDocument(page)
    await page.evaluate(() => document.querySelector('.rm-first-page-header')?.scrollIntoView({ block: 'center' }))
    const header = await rectOf(page, '.rm-first-page-header')

    // Directly on the text and in the empty margin above it (up to the paper edge).
    expect(await clickAndRead(page, header.bottom - 2)).toBe('header')
    expect(await clickAndRead(page, header.top - 8)).toBe('header')
  })

  test('the band stops at the body, it does not swallow body clicks', async ({ page }) => {
    await openBlankDocument(page)
    await page.evaluate(() => document.querySelector('.rm-first-page-header')?.scrollIntoView({ block: 'center' }))
    const header = await rectOf(page, '.rm-first-page-header')
    const paragraph = await rectOf(page, '.ProseMirror p')

    expect(await clickAndRead(page, paragraph.top + 6)).toBe('none')
    // Empty space between the header band and the first body line is body area, not header.
    expect(await clickAndRead(page, header.bottom + 40)).toBe('none')
  })

  test('the footer band opens on a single click, including below the text', async ({ page }) => {
    await openBlankDocument(page)
    await page.evaluate(() => document.querySelector('.rm-page-break .rm-page-footer')?.scrollIntoView({ block: 'center' }))
    const footer = await rectOf(page, '.rm-page-break .rm-page-footer')

    // On the text, and in the bottom margin below it — the case that used to need a double click.
    expect(await clickAndRead(page, footer.top + 6)).toBe('footer')
    expect(await clickAndRead(page, footer.bottom + 6)).toBe('footer')

    const lastLine = await rectOf(page, '.ProseMirror p')
    expect(await clickAndRead(page, lastLine.top + 6)).toBe('none')
  })
})
