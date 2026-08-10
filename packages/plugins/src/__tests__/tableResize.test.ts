import { describe, it, expect } from 'vitest'
import { createEditor } from '@kedata-indonesia/docflow-core'
import { tablePlugin } from '../index.js'

/**
 * Regression tests for the custom ManualColumnResize extension in
 * packages/core/src/Editor.ts (the native prosemirror-tables column resizer
 * is disabled; resizable: false in packages/plugins/src/table.ts).
 *
 *   - #116: dragging an internal border must REDISTRIBUTE width between the
 *     two adjacent columns (grow one, shrink the other, total constant) so the
 *     handle is never "locked" when the table already fills the page.
 *   - #55:  clicking inside a table pasted from Google Docs/Word (which often
 *     has colspan merged cells) must target the correct LOGICAL column.
 *
 * Note on the environment: happy-dom does not compute layout, so
 * getBoundingClientRect()/clientWidth return 0. That is fine here — the
 * resizer reads column widths from the authoritative <colgroup><col>
 * elements (rendered from the `colwidth` attrs), and the mousedown clientX is
 * derived from the cell's own bounding rect so the "within 16px of the edge"
 * test passes regardless of the actual layout values.
 */

function makeTableContent(cells: { cw: number[][] }[]): object {
  return {
    type: 'doc',
    content: [
      {
        type: 'table',
        content: cells.map((row) => ({
          type: 'tableRow',
          content: row.cw.map((widths, i) => ({
            type: i === 0 ? 'tableHeader' : 'tableCell',
            attrs: { colwidth: widths },
            content: [{ type: 'paragraph' }],
          })),
        })),
      },
    ],
  }
}

function setup(content: object) {
  const target = document.createElement('div')
  document.body.appendChild(target)
  const inst = createEditor({ target, plugins: [tablePlugin], content })
  const firstCell = () => target.querySelector('table td, table th') as HTMLElement
  const colWidths = () =>
    Array.from(target.querySelectorAll('table colgroup col')).map(
      (c) => parseFloat((c as HTMLElement).style.width) || 0,
    )
  return { target, inst, firstCell, colWidths }
}

function drag(cell: HTMLElement, dx: number): void {
  // clientX = the cell's right edge → distRight === 0 (always within the 16px
  // hit zone), independent of happy-dom's zeroed layout.
  const startX = cell.getBoundingClientRect().right
  cell.dispatchEvent(
    new MouseEvent('mousedown', { clientX: startX, clientY: 8, bubbles: true, cancelable: true, button: 0 }),
  )
  document.dispatchEvent(new MouseEvent('mousemove', { clientX: startX + dx, buttons: 1 }))
  document.dispatchEvent(new MouseEvent('mouseup', { clientX: startX + dx, bubbles: true, cancelable: true }))
}

describe('ManualColumnResize — #116 redistributive resize', () => {
  it('grows the dragged column and shrinks its neighbor (total width constant)', () => {
    const { target, inst, firstCell, colWidths } = setup(
      makeTableContent([{ cw: [[300], [300]] }]),
    )
    try {
      const before = colWidths()
      drag(firstCell(), 80)
      const after = colWidths()

      expect(after[0]).toBeGreaterThan(before[0])
      expect(after[1]).toBeLessThan(before[1])
      expect(Math.round(after[0] + after[1])).toBeCloseTo(
        Math.round(before[0] + before[1]),
        -1,
      )
    } finally {
      inst.destroy()
      target.remove()
    }
  })

  it('never shrinks a column below the 20px minimum', () => {
    const { target, inst, firstCell, colWidths } = setup(
      makeTableContent([{ cw: [[300], [300]] }]),
    )
    try {
      const before = colWidths()
      // Drag way past the point where the neighbor would hit 20px.
      drag(firstCell(), 500)
      const after = colWidths()

      expect(after[1]).toBeGreaterThanOrEqual(19)        // neighbor floored at ~20
      expect(after[1]).toBeLessThanOrEqual(21)
      expect(Math.round(after[0] + after[1])).toBeCloseTo(
        Math.round(before[0] + before[1]),
        -1,
      )
    } finally {
      inst.destroy()
      target.remove()
    }
  })

  it('does not lock when the table already fills the container width', () => {
    // The #116 report: table at full width → handle appears locked. With the
    // redistributive model the total stays constant, so a drag must still move
    // the border regardless of how full the table is.
    const { target, inst, firstCell, colWidths } = setup(
      makeTableContent([{ cw: [[2000], [2000]] }]),
    )
    try {
      const before = colWidths()
      drag(firstCell(), 60)
      const after = colWidths()

      expect(after[0]).toBeGreaterThan(before[0])
      expect(after[1]).toBeLessThan(before[1])
    } finally {
      inst.destroy()
      target.remove()
    }
  })

  it('persists the redistributed widths into the ProseMirror document', () => {
    const { target, inst, firstCell } = setup(
      makeTableContent([{ cw: [[300], [300]] }]),
    )
    try {
      const readColwidths = (): number[][] => {
        const cells: number[][] = []
        inst.editor.state.doc.descendants((node) => {
          if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
            cells.push(node.attrs.colwidth)
          }
          return true
        })
        return cells
      }
      const before = readColwidths()
      drag(firstCell(), 80)
      const after = readColwidths()

      expect(after[0][0]).toBeGreaterThan(before[0][0])  // col 0 grew in the doc
      expect(after[1][0]).toBeLessThan(before[1][0])     // col 1 shrank in the doc
    } finally {
      inst.destroy()
      target.remove()
    }
  })
})

describe('ManualColumnResize — #55 colspan-aware targeting', () => {
  it('targets the last logical column of a merged (colspan) cell', () => {
    // Row 0: a merged cell spanning columns 0+1, plus a normal cell (col 2).
    // Row 1: three normal cells.
    // Dragging the merged cell's RIGHT edge must resize the border between
    // logical columns 1 and 2 — column 0 stays untouched.
    const { target, inst, colWidths } = setup({
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', attrs: { colspan: 2, colwidth: [200, 200] }, content: [{ type: 'paragraph' }] },
                { type: 'tableCell', attrs: { colwidth: [200] }, content: [{ type: 'paragraph' }] },
              ],
            },
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', attrs: { colwidth: [200] }, content: [{ type: 'paragraph' }] },
                { type: 'tableCell', attrs: { colwidth: [200] }, content: [{ type: 'paragraph' }] },
                { type: 'tableCell', attrs: { colwidth: [200] }, content: [{ type: 'paragraph' }] },
              ],
            },
          ],
        },
      ],
    })
    try {
      const before = colWidths()
      // The merged cell is the first cell in the first row.
      const mergedCell = target.querySelector('table tr td') as HTMLElement
      drag(mergedCell, 50)
      const after = colWidths()

      expect(after[0]).toBe(before[0])      // column 0 untouched
      expect(after[1]).toBeGreaterThan(before[1])  // column 1 (end of merge) grew
      expect(after[2]).toBeLessThan(before[2])     // column 2 (neighbor) shrank
    } finally {
      inst.destroy()
      target.remove()
    }
  })
})
