import { test, expect, type Page } from '@playwright/test'

/**
 * Issue #295 — the ruler's margin markers used to be decoration. Dragging one has to
 * change the page margins (so the paper and the text column re-lay out) without touching
 * the document: margins are view state, not content.
 */

async function openBlankDocument(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('select.pg-select').first().selectOption('blank')
  await expect(page.locator('.docs-editor__paper .ProseMirror')).toBeVisible()
}

function firstParagraph(page: Page) {
  return page.locator('.docs-editor__paper .ProseMirror p').first()
}

function editorHtml(page: Page) {
  return page.evaluate(() => {
    const instance = (window as unknown as { __docsEditor?: { getHTML: () => string } }).__docsEditor
    if (!instance) throw new Error('window.__docsEditor is not available')
    return instance.getHTML()
  })
}

async function dragMarker(page: Page, side: 'left' | 'right', deltaX: number): Promise<void> {
  const marker = page.getByTestId(`ruler-margin-${side}`)
  await expect(marker).toBeVisible()
  const box = await marker.boundingBox()
  if (!box) throw new Error(`marker ${side} has no box`)
  const startX = box.x + box.width / 2
  const startY = box.y + box.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + deltaX, startY, { steps: 8 })
  await page.mouse.up()
}

test.describe('draggable ruler margins (#295)', () => {
  test.describe.configure({ timeout: 60_000 })

  test('dragging the left marker widens the left margin and moves the text', async ({ page }) => {
    await openBlankDocument(page)
    const paragraph = firstParagraph(page)
    const htmlBefore = await editorHtml(page)
    const before = await paragraph.boundingBox()
    if (!before) throw new Error('paragraph has no box')

    await dragMarker(page, 'left', 40)

    await expect(page.getByTestId('ruler-margin-left')).not.toHaveAttribute('aria-valuenow', '94')
    const after = await paragraph.boundingBox()
    if (!after) throw new Error('paragraph has no box')
    // The text column starts further right, and is the same width minus the margin.
    expect(after.x - before.x).toBeGreaterThan(25)
    expect(before.width - after.width).toBeGreaterThan(25)

    // Margins are view state: the document itself must be untouched.
    expect(await editorHtml(page)).toBe(htmlBefore)
  })

  test('dragging the right marker left narrows the text column', async ({ page }) => {
    await openBlankDocument(page)
    const paragraph = firstParagraph(page)
    const before = await paragraph.boundingBox()
    if (!before) throw new Error('paragraph has no box')

    await dragMarker(page, 'right', -40)

    const after = await paragraph.boundingBox()
    if (!after) throw new Error('paragraph has no box')
    expect(before.width - after.width).toBeGreaterThan(25)
  })

  test('the markers are keyboard operable and report their value', async ({ page }) => {
    await openBlankDocument(page)
    const marker = page.getByTestId('ruler-margin-left')

    await expect(marker).toHaveAttribute('role', 'separator')
    await expect(marker).toHaveAttribute('aria-valuemin', '0')
    const initial = Number(await marker.getAttribute('aria-valuenow'))
    expect(initial).toBeGreaterThan(0)

    await marker.focus()
    await page.keyboard.press('ArrowRight')
    expect(Number(await marker.getAttribute('aria-valuenow'))).toBe(initial + 8)

    await page.keyboard.press('ArrowLeft')
    expect(Number(await marker.getAttribute('aria-valuenow'))).toBe(initial)
  })
})
