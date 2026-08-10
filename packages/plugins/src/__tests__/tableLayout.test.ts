import { describe, it, expect, afterEach } from 'vitest'
import { createEditor } from '@kedata-indonesia/docflow-core'
import { tablePlugin } from '../index.js'

/**
 * Tests for the column-layout switch in CustomTable.renderHTML
 * (packages/plugins/src/table.ts).
 *
 * Tables WITHOUT explicit colwidth render with `table-layout: auto` (columns
 * size to content) so a pasted table whose source widths were stripped doesn't
 * collapse to equal columns and wrap long text. Tables WITH explicit colwidth
 * get `data-colwidth="explicit"`, which CSS scopes to `table-layout: fixed`
 * (required by ManualColumnResize). See
 * docs/plans/clipboard-paste-pipeline-plan.md (paste table fix).
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
