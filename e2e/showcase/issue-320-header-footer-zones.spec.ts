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
 *
 * Issue #354 follow-ups: the band must span the whole page margin, must never take a click
 * from document content (including a block image), must pick the page that was clicked, and
 * must follow the zoom scale.
 */

/** A block image tall enough to reach the footer band when the page is full. */
const IMAGE_SRC =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='150'%3E%3Crect width='150' height='150' fill='%2322d3ee'/%3E%3C/svg%3E"

type EditorWindow = { __docsEditor?: { view?: { dom?: HTMLElement } } }
type PlaygroundEditor = { commands: { setContent: (content: unknown) => void } }

async function openBlankDocument(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('select.pg-select').first().selectOption('blank')
  await expect(page.locator('.docs-editor__paper .ProseMirror')).toBeVisible()
  await page.locator('.docs-editor__paper').click()
  await page.keyboard.type('Body line one')
  // Pagination builds the widgets after the content; wait before measuring/scrolling them.
  await page.waitForFunction(() => {
    const root = (window as unknown as EditorWindow).__docsEditor?.view?.dom
    if (!root) return false
    return Boolean(
      root.querySelector('.rm-first-page-header') &&
        root.querySelector('.rm-page-break .rm-page-footer'),
    )
  })
}

/** A four-page fixture with a header and a footer on every page. */
async function openLongDocument(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('select.pg-select').first().selectOption('long')
  await expect(page.locator('.docs-editor__paper .ProseMirror')).toBeVisible()
  await page.waitForFunction(
    () => {
      const root = (window as unknown as EditorWindow).__docsEditor?.view?.dom
      if (!root) return false
      const visible = Array.from(root.querySelectorAll('.rm-page-break .rm-page-footer')).filter((el) => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.height > 0
      })
      return visible.length > 1
    },
    undefined,
    { timeout: 15_000 },
  )
  // Let the pagination/scroll transactions from the document switch settle before scrolling.
  await page.waitForTimeout(800)
}

type Rect = { top: number; bottom: number }

async function rectOf(page: Page, selector: string): Promise<Rect> {
  const rect = await page.evaluate((sel) => {
    const root = (window as unknown as EditorWindow).__docsEditor?.view?.dom
    const el = (root ?? document).querySelector(sel) as HTMLElement | null
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { top: Math.round(r.top), bottom: Math.round(r.bottom) }
  }, selector)
  expect(rect, `${selector} harus ada`).not.toBeNull()
  return rect as Rect
}

async function lastRectOf(page: Page, selector: string): Promise<Rect> {
  const rect = await page.evaluate((sel) => {
    const root = (window as unknown as EditorWindow).__docsEditor?.view?.dom
    const els = Array.from((root ?? document).querySelectorAll<HTMLElement>(sel))
    const el = els[els.length - 1]
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { top: Math.round(r.top), bottom: Math.round(r.bottom) }
  }, selector)
  expect(rect, `${selector} (last) harus ada`).not.toBeNull()
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

/** Index of the active header/footer among the visible widgets of its own editor. */
function activeIndex(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const active = document.querySelector('.rm-header-active, .rm-footer-active')
    if (!active) return -1
    const root = active.closest('.ProseMirror') ?? document
    const visible = Array.from(root.querySelectorAll(sel)).filter((el) => {
      const rect = el.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    })
    return visible.indexOf(active)
  }, selector)
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

async function applyZoom(page: Page, percent: number): Promise<void> {
  await page.getByTestId('toolbar-zoom').click()
  await page
    .getByTestId('toolbar-zoom-menu')
    .getByRole('button', { name: `${percent}%`, exact: true })
    .click()
  await expect(page.getByTestId('toolbar-zoom')).toContainText(`${percent}%`)
  await page.waitForTimeout(400)
}

/** Scroll the live editor to the top (the demo keeps the last scroll position). */
async function scrollEditorTop(page: Page): Promise<void> {
  await page.evaluate(() => {
    const root = (window as unknown as EditorWindow).__docsEditor?.view?.dom
    const scroll = root?.closest('.docs-editor-scroll') as HTMLElement | null
    if (scroll) scroll.scrollTop = 0
  })
  await page.waitForTimeout(300)
}

test.describe('header/footer margin hit areas (#320)', () => {
  test.describe.configure({ timeout: 90_000 })

  test('the header band above the text opens the header editor', async ({ page }) => {
    await openBlankDocument(page)
    await page.evaluate(() => {
      const root = (window as unknown as EditorWindow).__docsEditor?.view?.dom
      root?.querySelector('.rm-first-page-header')?.scrollIntoView({ block: 'center' })
    })
    await page.waitForTimeout(200)
    const header = await rectOf(page, '.rm-first-page-header')

    // Directly on the text and in the empty margin above it (up to the paper edge).
    expect(await clickAndRead(page, header.bottom - 2)).toBe('header')
    expect(await clickAndRead(page, header.top - 8)).toBe('header')
  })

  test('the band spans the whole page margin, not just the text box', async ({ page }) => {
    await openBlankDocument(page)
    await scrollEditorTop(page)
    const layout = await page.evaluate(() => {
      const root = (window as unknown as EditorWindow).__docsEditor?.view?.dom
      if (!root) return null
      const header = root.querySelector('.rm-first-page-header')?.getBoundingClientRect()
      const paper = root.closest('.docs-editor__paper')?.getBoundingClientRect()
      if (!header || !paper) return null
      return {
        headerBottom: Math.round(header.bottom),
        paperLeft: Math.round(paper.left),
        paperRight: Math.round(paper.right),
      }
    })
    if (!layout) throw new Error('editor layout not found')

    await closeSlot(page)
    await page.mouse.click(layout.paperLeft + 32, layout.headerBottom - 2)
    await page.waitForTimeout(150)
    expect(await openSlot(page)).toBe('header')
    await closeSlot(page)

    await page.mouse.click(layout.paperRight - 32, layout.headerBottom - 2)
    await page.waitForTimeout(150)
    expect(await openSlot(page)).toBe('header')
    await closeSlot(page)
  })

  test('the band stops at the body, it does not swallow body clicks', async ({ page }) => {
    await openBlankDocument(page)
    await page.evaluate(() => {
      const root = (window as unknown as EditorWindow).__docsEditor?.view?.dom
      root?.querySelector('.rm-first-page-header')?.scrollIntoView({ block: 'center' })
    })
    await page.waitForTimeout(200)
    const header = await rectOf(page, '.rm-first-page-header')
    const paragraph = await rectOf(page, '.ProseMirror p')

    expect(await clickAndRead(page, paragraph.top + 6)).toBe('none')
    // Empty space between the header band and the first body line is body area, not header.
    expect(await clickAndRead(page, header.bottom + 40)).toBe('none')
  })

  test('the footer band opens on a single click, including below the text', async ({ page }) => {
    await openBlankDocument(page)
    await page.evaluate(() => {
      const root = (window as unknown as EditorWindow).__docsEditor?.view?.dom
      root?.querySelector('.rm-page-break .rm-page-footer')?.scrollIntoView({ block: 'center' })
    })
    await page.waitForTimeout(200)
    const footer = await rectOf(page, '.rm-page-break .rm-page-footer')

    // On the text, and in the bottom margin below it — the case that used to need a double click.
    expect(await clickAndRead(page, footer.top + 6)).toBe('footer')
    expect(await clickAndRead(page, footer.bottom + 6)).toBe('footer')

    const lastLine = await lastRectOf(page, '.ProseMirror p')
    expect(await clickAndRead(page, lastLine.bottom - 2)).toBe('none')
  })

  test('the footer band does not swallow the last block on the page', async ({ page }) => {
    await openBlankDocument(page)
    await page.waitForFunction(() => Boolean((window as unknown as EditorWindow).__docsEditor))
    await page.evaluate((src) => {
      const editor = (window as unknown as { __docsEditor: PlaygroundEditor }).__docsEditor
      editor.commands.setContent({
        type: 'doc',
        content: Array.from({ length: 25 }, (_, i) => ({
          type: 'paragraph',
          content: [{ type: 'text', text: `Line ${i + 1}` }],
        })).concat([{ type: 'image', attrs: { src } }]),
      })
    }, IMAGE_SRC)
    await page.waitForTimeout(700)
    await page.evaluate(() => {
      const root = (window as unknown as EditorWindow).__docsEditor?.view?.dom
      const imgs = Array.from(root?.querySelectorAll('img') ?? [])
      imgs[imgs.length - 1]?.scrollIntoView({ block: 'center' })
    })
    await page.waitForTimeout(400)

    const layout = await page.evaluate(() => {
      const root = (window as unknown as EditorWindow).__docsEditor?.view?.dom
      if (!root) return null
      const imgs = Array.from(root.querySelectorAll('img'))
      const img = imgs[imgs.length - 1]
      if (!img) return null
      const r = img.getBoundingClientRect()
      const footer = Array.from(root.querySelectorAll('.rm-page-break .rm-page-footer')).find(
        (el) => el.getBoundingClientRect().top > r.bottom,
      )
      return {
        img: {
          bottom: Math.round(r.bottom),
          left: Math.round(r.left),
          right: Math.round(r.right),
        },
        footerTop: footer ? Math.round(footer.getBoundingClientRect().top) : null,
      }
    })
    if (!layout || layout.footerTop === null) throw new Error('image or footer not found')

    // The image must sit inside the 8 px band; otherwise the click would not exercise the bug.
    expect(layout.footerTop - layout.img.bottom).toBeLessThan(8)

    await page.mouse.click(Math.round((layout.img.left + layout.img.right) / 2), layout.img.bottom - 1)
    await page.waitForTimeout(150)
    expect(await openSlot(page)).toBe('none')
    await closeSlot(page)
  })

  test("a margin click on a later page opens that page's editor", async ({ page }) => {
    await openLongDocument(page)
    await closeSlot(page)

    const headerTarget = await page.evaluate(() => {
      const root = (window as unknown as EditorWindow).__docsEditor?.view?.dom
      if (!root) return null
      const visible = Array.from(root.querySelectorAll<HTMLElement>('.rm-page-break .rm-page-header')).filter(
        (el) => {
          const r = el.getBoundingClientRect()
          return r.width > 0 && r.height > 0
        },
      )
      const header = visible[0]
      if (!header) return null
      header.scrollIntoView({ block: 'center' })
      const r = header.getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), top: Math.round(r.top) }
    })
    if (!headerTarget) throw new Error('page 2 header not found')
    await page.mouse.click(headerTarget.x, headerTarget.top - 4)
    await page.waitForTimeout(150)
    expect(await openSlot(page)).toBe('header')
    expect(await activeIndex(page, '.rm-page-break .rm-page-header')).toBe(0)
    await closeSlot(page)

    const footerTarget = await page.evaluate(() => {
      const root = (window as unknown as EditorWindow).__docsEditor?.view?.dom
      if (!root) return null
      const visible = Array.from(root.querySelectorAll<HTMLElement>('.rm-page-break .rm-page-footer')).filter(
        (el) => {
          const r = el.getBoundingClientRect()
          return r.width > 0 && r.height > 0
        },
      )
      const footer = visible[1]
      if (!footer) return null
      footer.scrollIntoView({ block: 'center' })
      const r = footer.getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), bottom: Math.round(r.bottom) }
    })
    if (!footerTarget) throw new Error('page 2 footer not found')
    await page.mouse.click(footerTarget.x, footerTarget.bottom + 6)
    await page.waitForTimeout(150)
    expect(await openSlot(page)).toBe('footer')
    expect(await activeIndex(page, '.rm-page-break .rm-page-footer')).toBe(1)
    await closeSlot(page)
  })

  test('the margin band follows the zoom scale', async ({ page }) => {
    await openBlankDocument(page)
    await applyZoom(page, 150)
    await scrollEditorTop(page)

    const layout = await page.evaluate(() => {
      const root = (window as unknown as EditorWindow).__docsEditor?.view?.dom
      if (!root) return null
      const header = root.querySelector('.rm-first-page-header')?.getBoundingClientRect()
      const paper = root.closest('.docs-editor__paper')?.getBoundingClientRect()
      if (!header || !paper) return null
      return {
        headerBottom: Math.round(header.bottom),
        paperLeft: Math.round(paper.left),
      }
    })
    if (!layout) throw new Error('editor layout not found')

    await page.mouse.click(layout.paperLeft + 32, layout.headerBottom - 2)
    await page.waitForTimeout(150)
    expect(await openSlot(page)).toBe('header')
    await closeSlot(page)
  })
})
