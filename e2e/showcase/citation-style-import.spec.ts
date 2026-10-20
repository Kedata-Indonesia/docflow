import { test, expect } from '@playwright/test'

/**
 * Issue #251 — importing a `.csl` style from the references sidebar. The style
 * must appear in the Citation Style picker immediately, be selected, and render
 * citations with its own layout. `.bst`/`.ens` are not CSL and get a clear
 * message; a malformed `.csl` must not replace the active style.
 */

const csl = (id: string, name: string) =>
  [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0" default-locale="en-US">',
    `  <info><title>${name}</title><id>${id}</id></info>`,
    '  <citation><layout prefix="E2E(" suffix=")"><text variable="title"/></layout></citation>',
    '  <bibliography><layout><text variable="title"/></layout></bibliography>',
    '</style>',
  ].join('\n')

test('imports a .csl style and renders citations with it (#251)', async ({ page }) => {
  const stamp = Date.now()
  const id = `e2e-import-${stamp}`
  const name = `E2E Imported ${stamp}`

  // The playground persists imported styles across reloads (host persistence
  // demo); clear it so the run starts from the bundled four.
  await page.addInitScript(() => window.localStorage.removeItem('docflow.playground.imported-csl-style'))
  await page.goto('/')
  await page.waitForFunction(() => Boolean((window as unknown as { __docsEditor?: unknown }).__docsEditor))

  await page.getByRole('button', { name: 'References', exact: true }).click()
  const input = page.getByTestId('citation-style-import-input')
  await expect(input).toBeAttached()

  await input.setInputFiles({
    name: 'e2e-import.csl',
    mimeType: 'application/xml',
    buffer: Buffer.from(csl(id, name)),
  })

  // The imported style is in the picker and selected.
  await expect(page.getByTestId('citation-style-select')).toHaveValue(id)
  await expect(page.getByTestId('citation-style-import-message')).toContainText(name)

  // Citing a source renders with the imported layout (the distinctive prefix).
  await page.locator('.references-sidebar button').filter({ hasText: 'Cite' }).first().click()
  await expect(page.locator('.docs-editor__paper')).toContainText('E2E(')

  // `.bst` is a BibTeX style, not CSL — a clear message, no silent failure.
  await input.setInputFiles({
    name: 'style.bst',
    mimeType: 'text/plain',
    buffer: Buffer.from('ENTRY { } {}'),
  })
  await expect(page.getByTestId('citation-style-import-message')).toContainText('.bst')

  // A malformed .csl must leave the imported style active.
  await input.setInputFiles({
    name: 'broken.csl',
    mimeType: 'application/xml',
    buffer: Buffer.from('<style>'),
  })
  await expect(page.getByTestId('citation-style-import-message')).toContainText('valid CSL')
  await expect(page.getByTestId('citation-style-select')).toHaveValue(id)
})
