import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * Visual capture harness for the Tailwind 3 -> 4 migration (issue #215).
 *
 * Tailwind 4 changes utility *defaults* (border colour, ring width, the shadow/blur
 * scale, `outline-hidden`, ...). Unit tests and the e2e specs assert structure and
 * geometry, so a silently restyled button passes every existing gate. This harness
 * exists to make that class of change visible: it captures a fixed set of UI states and
 * `scripts/visual-diff.mjs` compares two runs pixel by pixel.
 *
 * It is NOT a CI gate. Baselines churn with every intentional design change, and a
 * permanently-red visual job is one nobody reads. Run it before and after the
 * migration (see docs/plans/tailwind4-migration-plan.md).
 *
 *   VISUAL_OUT=test-results/visual/before pnpm exec playwright test --project=visual
 *   VISUAL_OUT=test-results/visual/after  pnpm exec playwright test --project=visual
 *   node scripts/visual-diff.mjs test-results/visual/before test-results/visual/after
 */

// Deliberately outside `test-results/`: Playwright wipes that directory at the start
// of every run, which would delete the "before" capture the diff needs.
const OUT = process.env.VISUAL_OUT ?? path.join('visual-runs', 'current')

/** Kill anything that makes two runs differ without a design change. */
const DETERMINISM_CSS = `
  *, *::before, *::after {
    transition: none !important;
    animation: none !important;
    caret-color: transparent !important;
    scroll-behavior: auto !important;
  }
  ::-webkit-scrollbar { display: none !important; }
`

async function settle(page: Page): Promise<void> {
  await page.addStyleTag({ content: DETERMINISM_CSS })
  await page.evaluate(() => document.fonts.ready)
  // Two frames of paint so layout-triggered styles land before the capture.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
}

async function createBlankDocument(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('select.pg-select').first().selectOption('blank')
  await expect(page.locator('.docs-editor__paper .ProseMirror')).toBeVisible()
}

async function insertContent(page: Page, html: string): Promise<void> {
  await page.evaluate((content) => {
    const editor = (
      window as unknown as {
        __docsEditor?: { commands: { insertContent: (html: string) => boolean } }
      }
    ).__docsEditor
    if (!editor) throw new Error('window.__docsEditor is not available')
    editor.commands.insertContent(content)
  }, html)
  await page.waitForTimeout(400)
}

async function shoot(page: Page, name: string): Promise<void> {
  await settle(page)
  await fs.mkdir(OUT, { recursive: true })
  await page.screenshot({ path: path.join(OUT, `${name}.png`), animations: 'disabled' })
}

test.describe('visual capture', () => {
  test('editor — light theme', async ({ page }) => {
    await createBlankDocument(page)
    await insertContent(
      page,
      '<h1>Quarterly report</h1><p>Body copy with <strong>bold</strong> and <em>italic</em>.</p>' +
        '<blockquote><p>A quoted line.</p></blockquote><ul><li>First</li><li>Second</li></ul>',
    )
    await shoot(page, 'editor-light')
  })

  test('editor — dark theme', async ({ page }) => {
    await createBlankDocument(page)
    await insertContent(page, '<h1>Quarterly report</h1><p>Body copy with <strong>bold</strong>.</p>')
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await shoot(page, 'editor-dark')
  })
})

test.describe('visual capture — popups', () => {
  test('heading dropdown', async ({ page }) => {
    await createBlankDocument(page)
    await page.locator('[data-testid="toolbar-heading"]').click()
    await expect(page.locator('[data-testid="toolbar-heading-menu"]')).toBeVisible()
    await shoot(page, 'dropdown-heading')
  })

  test('text colour picker', async ({ page }) => {
    await createBlankDocument(page)
    await page.locator('[data-testid="toolbar-text-color"]').click()
    // The colour grid is its own component (ColorPickerDropdown), so it is addressed
    // by its root class rather than a test hook.
    await expect(page.locator('.color-picker-dropdown')).toBeVisible()
    await shoot(page, 'dropdown-text-color')
  })
})

test.describe('visual capture — pagination', () => {
  test('multi-page document', async ({ page }) => {
    await createBlankDocument(page)
    const paragraphs = Array.from(
      { length: 90 },
      (_, index) => `<p>Paragraph ${index}: ${'word '.repeat(25)}</p>`,
    ).join('')
    await insertContent(page, paragraphs)
    // `rm-page-break` markers are zero-height, so visibility never resolves; waiting on
    // the count is the honest signal that pagination has produced a second page.
    await expect
      .poll(() => page.locator('.docs-editor__paper [data-rm-pagination] > .rm-page-break').count(), {
        timeout: 10_000,
      })
      .toBeGreaterThan(0)
    await shoot(page, 'paper-paginated')
  })
})
