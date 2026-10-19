import { test, expect, type Page } from '@playwright/test'

/**
 * Paste-pipeline e2e for issue #222, outside `e2e/showcase`.
 *
 * `table-paste-pagination.spec.ts` owns the pagination geometry of the two-table
 * regression (#163) inside the demo app. This spec owns the pipeline itself: the
 * Google-Docs payload (with the `<b id="docs-internal-guid-…">` wrapper and a
 * `colspan` cell) must arrive in a fresh editor as one table with its shape
 * intact, exactly once, without console errors — the failure mode being a paste
 * that silently duplicates content or drops the column span.
 */

const MARKER = 'PIPE-222'

function buildDocsPayload(): string {
  const text = (value: string): string =>
    `<span style="font-size:11pt;color:rgb(0,0,0);background-color:transparent">${value}</span>`
  return (
    '<meta charset="utf-8">' +
    `<b style="font-weight:normal;" id="docs-internal-guid-pipe-222">` +
    '<table style="border-collapse:collapse;table-layout:fixed;">' +
    `<tr><td colspan="2">${text(`${MARKER} header`)}</td></tr>` +
    `<tr><td>${text(`${MARKER} a`)}</td><td>${text(`${MARKER} b`)}</td></tr>` +
    `<tr><td>${text(`${MARKER} c`)}</td><td>${text(`${MARKER} d`)}</td></tr>` +
    '</table></b>'
  )
}

/** Dispatch a real paste event with the HTML payload, the way the showcase spec does. */
async function pasteHtml(page: Page, html: string): Promise<void> {
  await page.evaluate((payload) => {
    const data = new DataTransfer()
    data.setData('text/html', payload)
    data.setData('text/plain', 'pipe-222 plain fallback')
    const target = document.querySelector('.ProseMirror')
    if (!target) throw new Error('paste spec: no .ProseMirror to paste into')
    target.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    )
  }, html)
}

test.describe('paste pipeline', () => {
  test('a Google-Docs table paste keeps its shape and lands once', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.on('pageerror', (error) => consoleErrors.push(error.message))

    await page.goto('/lifecycle.html')
    await page.click('#mount')
    await expect(page.locator('.ProseMirror')).toHaveCount(1)

    await pasteHtml(page, buildDocsPayload())

    // One table, three rows, the colspan preserved, and the marker text exactly once.
    await expect(page.locator('.ProseMirror table')).toHaveCount(1)
    await expect(page.locator('.ProseMirror table tr')).toHaveCount(3)
    await expect(page.locator('.ProseMirror table td[colspan="2"]')).toHaveCount(1)

    const occurrences = await page.evaluate(
      (marker) => (document.querySelector('.ProseMirror')?.textContent ?? '').split(marker).length - 1,
      MARKER,
    )
    expect(occurrences).toBe(5) // header + four cells, once each — no duplicated paste

    await expect(page.locator('.ProseMirror')).toHaveCount(1)
    expect(consoleErrors).toEqual([])
  })
})
