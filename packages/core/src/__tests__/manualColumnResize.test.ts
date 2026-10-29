import { describe, expect, it } from 'vitest'
import {
  borderXForHit,
  buildResizePlan,
  hitCell,
  targetColumnForHit,
} from '../manualColumnResize/columnGeometry.js'
import { collectColumnWidths } from '../manualColumnResize/columnMeasure.js'
import { applyColumnWidthsToDom } from '../manualColumnResize/columnDom.js'

/**
 * `ManualColumnResize` runs on real pointer events, so these tests pin the two
 * pure halves: hit-testing (colspan aware, #55) and the DOM width writer. The
 * drag loop itself only forwards these values to the same functions.
 */

const TABLE_HTML = `
  <table>
    <colgroup>
      <col style="width: 100px" />
      <col style="width: 100px" />
      <col style="width: 100px" />
    </colgroup>
    <tr>
      <td colspan="2" id="merged">merged</td>
      <td id="last">last</td>
    </tr>
    <tr>
      <td id="a">a</td>
      <td id="b">b</td>
      <td id="c">c</td>
    </tr>
  </table>
`

function renderTable(html = TABLE_HTML): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  return host.querySelector('table') as HTMLElement
}

function withRect(el: Element, left: number, width: number): void {
  el.getBoundingClientRect = () => ({
    left,
    right: left + width,
    width,
    top: 0,
    bottom: 20,
    height: 20,
    x: left,
    y: 0,
    toJSON: () => ({}),
  }) as DOMRect
}

/** Dispatch a mousedown so `event.target` is the element, then return it. */
function mousedownOn(el: Element, clientX: number): MouseEvent {
  let captured: MouseEvent | null = null
  const listener = (event: Event) => {
    captured = event as MouseEvent
  }
  el.addEventListener('mousedown', listener)
  el.dispatchEvent(new MouseEvent('mousedown', { clientX, bubbles: true }))
  el.removeEventListener('mousedown', listener)
  if (!captured) throw new Error('mousedown was not dispatched')
  return captured
}

describe('manualColumnResize geometry', () => {
  it('resolves the last logical column of a merged cell (#55)', () => {
    const table = renderTable()
    const merged = table.querySelector('#merged') as HTMLElement
    withRect(merged, 100, 200)

    const hit = hitCell(mousedownOn(merged, 297))!
    expect(hit).not.toBeNull()
    expect(hit.colStart).toBe(0)
    expect(hit.span).toBe(2)
    expect(targetColumnForHit(hit)).toBe(1)
    expect(borderXForHit(hit)).toBe(300)
  })

  it('ignores a left edge with no column before it', () => {
    const table = renderTable()
    const merged = table.querySelector('#merged') as HTMLElement
    withRect(merged, 100, 200)

    const hit = hitCell(mousedownOn(merged, 103))!
    expect(targetColumnForHit(hit)).toBeNull()
    expect(borderXForHit(hit)).toBeNull()
  })

  it('resizes the column before the cell on a left edge', () => {
    const table = renderTable()
    const cell = table.querySelector('#b') as HTMLElement
    withRect(cell, 200, 100)

    const hit = hitCell(mousedownOn(cell, 203))!
    expect(hit.colStart).toBe(1)
    expect(hit.domIndex).toBe(1)
    expect(targetColumnForHit(hit)).toBe(0)
    expect(borderXForHit(hit)).toBe(200)
  })

  it('ignores pointers that are not near an edge', () => {
    const table = renderTable()
    const cell = table.querySelector('#c') as HTMLElement
    withRect(cell, 300, 100)

    const hit = hitCell(mousedownOn(cell, 350))!
    expect(targetColumnForHit(hit)).toBeNull()
    expect(borderXForHit(hit)).toBeNull()
  })

  it('returns null outside a table cell', () => {
    const host = document.createElement('div')
    host.innerHTML = '<p id="text">plain text</p>'
    document.body.appendChild(host)
    const paragraph = host.querySelector('#text') as HTMLElement
    expect(hitCell(mousedownOn(paragraph, 10))).toBeNull()
  })

  it('measures every column from the colgroup', () => {
    const table = renderTable()
    expect(collectColumnWidths(table)).toEqual({
      widths: [100, 100, 100],
      totalCols: 3,
    })
  })

  it('falls back to the first-row cell when there is no colgroup', () => {
    const table = renderTable(`
      <table>
        <tr><td id="x">x</td><td id="y">y</td></tr>
      </table>
    `)
    withRect(table.querySelector('#x') as HTMLElement, 0, 90)
    withRect(table.querySelector('#y') as HTMLElement, 90, 70)
    expect(collectColumnWidths(table).widths).toEqual([90, 70])
  })

  it('clamps the last column against the content box', () => {
    const table = renderTable()
    const plan = buildResizePlan(table, 2, 500)
    expect(plan.isLastCol).toBe(true)
    // No paper ancestor: the 614px fallback minus the other two columns.
    expect(plan.maxNwLastCol).toBe(614 - 200)
    expect(plan.startW).toBe(100)
    expect(plan.startNeighborW).toBe(0)
  })

  it('keeps a neighbour for internal borders', () => {
    const table = renderTable()
    const plan = buildResizePlan(table, 0, 100)
    expect(plan.isLastCol).toBe(false)
    expect(plan.neighborIdx).toBe(1)
    expect(plan.startNeighborW).toBe(100)
  })
})

describe('manualColumnResize DOM writer', () => {
  it('writes col, cell and table widths', () => {
    const table = renderTable()
    applyColumnWidthsToDom(table, [120, 80, 100], 614)

    const cols = table.querySelectorAll('colgroup col')
    expect((cols[0] as HTMLElement).style.width).toBe('120px')
    expect((cols[1] as HTMLElement).style.width).toBe('80px')

    const firstCell = table.querySelector('tr')!.children[0] as HTMLElement
    expect(firstCell.style.width).toBe('120px')
    expect(firstCell.getAttribute('width')).toBe('120')
    expect(table.style.width).toBe('300px')
  })

  it('never lets the table overflow the content box', () => {
    const table = renderTable()
    applyColumnWidthsToDom(table, [400, 400, 400], 614)
    expect(table.style.width).toBe('614px')
  })
})
