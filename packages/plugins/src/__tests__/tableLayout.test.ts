import { describe, it, expect, afterEach } from 'vitest'
import { createEditor } from '@kedata-indonesia/docflow-core'
import { tablePlugin } from '../index.js'

/**
 * Tests for the column-layout switch in CustomTable.renderHTML
 * (packages/plugins/src/table.ts).
 *
 * Every table renders with `table-layout: fixed` (#140): column widths come
 * from the first row / <col> widths, not from cell content, so typing wraps the
 * text and grows the row height instead of widening the column. Tables WITH
 * explicit colwidth still emit `data-colwidth="explicit"` and per-column <col>
 * widths, which is what ManualColumnResize drives (and what gives those tables
 * their exact, non-equal widths); tables without it fall back to equal columns.
 */

function setup(content: object) {
  const target = document.createElement('div')
  document.body.appendChild(target)
  const inst = createEditor({ target, content, plugins: [tablePlugin] })
  return {
    target,
    inst,
    tableEl: () => inst.editor.view.dom.querySelector('table') as HTMLElement,
    destroy() {
      inst.destroy()
      target.remove()
    },
  }
}

describe('CustomTable column-layout attribute', () => {
  let s: ReturnType<typeof setup>
  afterEach(() => s?.destroy())

  it('omits data-colwidth when no cell has colwidth (auto-layout table)', () => {
    s = setup({
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableHeader', content: [{ type: 'paragraph' }] },
                { type: 'tableHeader', content: [{ type: 'paragraph' }] },
              ],
            },
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', content: [{ type: 'paragraph' }] },
                { type: 'tableCell', content: [{ type: 'paragraph' }] },
              ],
            },
          ],
        },
      ],
    })
    expect(s.tableEl().getAttribute('data-colwidth')).toBeNull()
  })

  it('sets data-colwidth="explicit" when cells carry colwidth', () => {
    s = setup({
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', attrs: { colwidth: [300] }, content: [{ type: 'paragraph' }] },
                { type: 'tableCell', attrs: { colwidth: [300] }, content: [{ type: 'paragraph' }] },
              ],
            },
          ],
        },
      ],
    })
    expect(s.tableEl().getAttribute('data-colwidth')).toBe('explicit')
  })

  it('omits data-colwidth when colwidth is present but all zero/invalid', () => {
    s = setup({
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', attrs: { colwidth: [0] }, content: [{ type: 'paragraph' }] },
                { type: 'tableCell', attrs: { colwidth: [null] }, content: [{ type: 'paragraph' }] },
              ],
            },
          ],
        },
      ],
    })
    expect(s.tableEl().getAttribute('data-colwidth')).toBeNull()
  })
})
