import { test, expect, type Page } from '@playwright/test'

/**
 * Regression coverage for the custom ManualColumnResize extension
 * (packages/core/src/Editor.ts) — exercises REAL Chromium mouse drags against
 * the demo app in this repo, complementing the jsdom unit tests in
 * packages/plugins/src/__tests__/tableResize.test.ts.
 *
 *   - #116: dragging an internal border must redistribute width (grow one
 *     column, shrink its neighbor, total constant) even when the table already
 *     fills the page — i.e. the handle must NOT be "locked".
 *   - #55:  resize must also work on tables pasted from Google Docs/Word,
 *     including ones that contain colspan merged cells.
 *
 * The playground exposes `window.__docsEditor` (its `@ready` handler) so specs
 * can insert precise table content via commands instead of toolbar UI.
 */

async function createBlank(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('select.pg-select').first().selectOption('blank')
  await expect(page.locator('.docs-editor__paper .ProseMirror')).toBeVisible()
}

/** Visible, editable table inside the paper (excludes the layout engine's
 *  off-screen measurement clone, which also renders a <table> in the DOM). */
const EDITABLE_TABLE = '.docs-editor__paper .ProseMirror table'

async function insertTableJson(page: Page, colWidths: number[]): Promise<void> {
  await page.evaluate(
    ([widths]) => {
      const editor = (
        window as unknown as { __docsEditor?: { commands: { insertContent: (c: unknown) => boolean } } }
      ).__docsEditor
      if (!editor) throw new Error('window.__docsEditor not exposed')
      const table = {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: widths.map(
              (w: number) => ({
                type: 'tableCell',
                attrs: { colwidth: [w] },
                content: [{ type: 'paragraph' }],
              }),
            ),
          },
        ],
      }
      editor.commands.insertContent({ type: 'doc', content: [table] })
    },
    [colWidths],
  )
  await expect(page.locator(EDITABLE_TABLE)).toBeVisible()
}

async function colWidths(page: Page): Promise<number[]> {
  return page.evaluate((sel: string) =>
    Array.from(document.querySelectorAll(`${sel} colgroup col`)).map((c) =>
      parseFloat((c as HTMLElement).style.width) || 0,
    ), EDITABLE_TABLE)
}

test.describe('Table column resize', () => {
  test('#116 redistributes width when the table fills the page', async ({ page }) => {
    await createBlank(page)
    // Fill the paper with two equal columns → "right edge at maximum margin".
    const paperWidth = await page.locator('.docs-editor__paper').evaluate(
      (el) => el.clientWidth,
    )
    const half = Math.floor(paperWidth / 2)
    await insertTableJson(page, [half, half])

    const before = await colWidths(page)
    expect(before[0] + before[1]).toBeGreaterThan(half) // table spans the page

    const tableBox = await page.locator(EDITABLE_TABLE).boundingBox()
    expect(tableBox).not.toBeNull()
    const borderX = tableBox!.x + before[0]
    const y = tableBox!.y + tableBox!.height / 2

    // Hover the internal border → the cyan indicator line should appear.
    await page.mouse.move(borderX, y)
    await expect(page.locator('.docflow-active-border-line')).toBeVisible()

    // Drag the border to the right by 60px.
    await page.mouse.down()
    await page.mouse.move(borderX + 60, y, { steps: 12 })
    await page.mouse.up()

    const after = await colWidths(page)
    expect(after[0]).toBeGreaterThan(before[0]) // col 0 grew
    expect(after[1]).toBeLessThan(before[1]) // col 1 shrank
    expect(Math.round(after[0] + after[1])).toBeCloseTo(
      Math.round(before[0] + before[1]),
      -1,
    ) // total unchanged — handle was NOT locked
  })

  test('#55 resize works on a pasted Google Docs table with colspan', async ({ page }) => {
    await createBlank(page)

    // Simulate a Google Docs clipboard: a 3-column table whose first row has a
    // merged cell (colspan=2) spanning columns 0+1.
    const gdocsHtml = `
      <table>
        <colgroup><col style="width:200px"><col style="width:200px"><col style="width:200px"></colgroup>
        <tbody>
          <tr><td colspan="2">merged</td><td>c</td></tr>
          <tr><td>a</td><td>b</td><td>c</td></tr>
        </tbody>
      </table>`

    await page.evaluate((html) => {
      const dt = new DataTransfer()
      dt.setData('text/html', html)
      document.querySelector('.ProseMirror')!.dispatchEvent(
        new ClipboardEvent('paste', {
          clipboardData: dt as unknown as DataTransfer,
          bubbles: true,
          cancelable: true,
        }),
      )
    }, gdocsHtml)
    await expect(page.locator(EDITABLE_TABLE)).toBeVisible()

    // Pasted tables often carry no explicit cell colwidth, so derive the
    // internal border and the column widths from REAL layout (the resizer's
    // initialWidth() path also reads getBoundingClientRect — same source).
    const probe = (r: number, c: number) =>
      page.evaluate(([sel, row, col]) => {
        const cell = document.querySelectorAll(`${sel} tr`)[row]?.children[col] as
          | HTMLElement
          | undefined
        if (!cell) return { x: 0, y: 0, w: 0 }
        const rect = cell.getBoundingClientRect()
        return { x: rect.right, y: rect.top + rect.height / 2, w: Math.round(rect.width) }
      }, [EDITABLE_TABLE, r, c] as [string, number, number])

    // Row 1 (second row) has three normal cells → its first cell's right edge
    // is the border between logical columns 0 and 1.
    const before = await probe(1, 0)

    await page.mouse.move(before.x, before.y)
    await page.mouse.down()
    await page.mouse.move(before.x + 40, before.y, { steps: 10 })
    await page.mouse.up()

    const after = await probe(1, 0)
    expect(after.w).toBeGreaterThan(before.w) // col 0 grew → resize worked on a pasted table
  })

  test('dragging the last column never overflows the page margin', async ({ page }) => {
    await createBlank(page)
    const paperWidth = await page.locator('.docs-editor__paper').evaluate(
      (el) => el.clientWidth,
    )
    const third = Math.floor(paperWidth / 3)
    await insertTableJson(page, [third, third, third])

    const before = await colWidths(page)
    const tableBox = await page.locator(EDITABLE_TABLE).boundingBox()
    // Right border of the LAST column.
    const borderX =
      tableBox!.x + before.slice(0, -1).reduce((a, b) => a + b, 0) + before[before.length - 1] - 2
    const y = tableBox!.y + tableBox!.height / 2

    await page.mouse.move(borderX, y)
    await page.mouse.down()
    await page.mouse.move(borderX + 500, y, { steps: 12 }) // drag way past the edge
    await page.mouse.up()

    const tableAfter = await page.locator(EDITABLE_TABLE).boundingBox()
    const paper = await page.locator('.docs-editor__paper').boundingBox()
    expect(tableAfter!.x + tableAfter!.width).toBeLessThanOrEqual(paper!.x + paper!.width + 1)
  })
})
