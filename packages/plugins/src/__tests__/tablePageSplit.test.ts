import { describe, it, expect, afterEach, vi } from 'vitest'
import { createEditor } from '@kedata-indonesia/docflow-core'
import { tablePlugin, tablePageSplitPlugin } from '../index.js'

/**
 * Tests for the experimental table-page-split plugin (Path B for the
 * "blank space above a tall pasted table" bug). See
 * docs/plans/clipboard-paste-pipeline-plan.md §9.
 *
 * The plugin reads --rm-max-content-child-height from the editor DOM and
 * measures each rendered <tr>. happy-dom doesn't lay out elements, so we mock
 * getBoundingClientRect and inject the CSS variable manually.
 */

function makeBigTableDoc(rowCount: number) {
  const rows = []
  for (let i = 0; i < rowCount; i++) {
    rows.push({
      type: 'tableRow',
      content: [
        {
          type: 'tableCell',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: `cell ${i} a` }] }],
        },
        {
          type: 'tableCell',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: `cell ${i} b` }] }],
        },
      ],
    })
  }
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'before' }],
      },
      {
        type: 'table',
        content: rows,
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'after' }],
      },
    ],
  }
}

function setup(content: object, opts: { split?: boolean; pageContentPx?: number | null } = {}) {
  const target = document.createElement('div')
  document.body.appendChild(target)

  const plugins = [tablePlugin]
  if (opts.split !== false) plugins.push(tablePageSplitPlugin)

  // Drive PaginationPlus page height so the unit-test "page-content area" is
  // a small fixed value. The plugin reads `--rm-max-content-child-height`
  // from view.dom.style (set by PaginationPlus in production); in the test
  // we set it manually because happy-dom doesn't run the full layout pass.
  const paginationOptions = opts.pageContentPx != null
    ? {
        pageHeight: opts.pageContentPx + 40,
        pageWidth: 600,
        marginTop: 10,
        marginBottom: 10,
        marginLeft: 10,
        marginRight: 10,
        contentMarginTop: 10,
        contentMarginBottom: 10,
      }
    : undefined

  const inst = createEditor({ target, content, plugins, paginationOptions } as any)

  if (opts.pageContentPx != null) {
    inst.editor.view.dom.style.setProperty('--rm-max-content-child-height', `${opts.pageContentPx}px`)
  }

  // Mock heights on the rendered DOM. Tables get 600px total spread across
  // their rows; default row height is 30px so a 20-row table is 600px tall.
  const tables = inst.editor.view.dom.querySelectorAll('table')
  const ROW_H = 30
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.tagName === 'TR') {
      const row = this as HTMLElement
      const tbody = row.parentElement
      const index = Array.from(tbody?.children ?? []).indexOf(row)
      return { x: 0, y: index * ROW_H, top: index * ROW_H, left: 0, right: 0, bottom: (index + 1) * ROW_H, width: 0, height: ROW_H, toJSON: () => ({}) } as DOMRect
    }
    return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) } as DOMRect
  })

  /**
   * Wait for the deferred table-split microtask to run. The plugin schedules
   * its work via `queueMicrotask` (after `view.updateState`) so the DOM is
   * current by the time measurement happens — see tablePageSplit.ts header.
   * Tests that exercise a real split must await this helper before asserting
   * on `editor.getJSON()`.
   */
  const awaitSplit = async () => {
    // Two ticks: the queued microtask dispatches a follow-up tr which itself
    // schedules another microtask. We yield until no further doc mutation
    // happens (or the timeout fires).
    let prev = ''
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 0))
      const cur = JSON.stringify(inst.editor.getJSON())
      if (cur === prev) return
      prev = cur
    }
  }

  return {
    target,
    inst,
    tables,
    awaitSplit,
    destroy() {
      vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockRestore()
      inst.destroy()
      target.remove()
    },
  }
}

describe('tablePageSplitPlugin', () => {
  let s: ReturnType<typeof setup>
  afterEach(() => s?.destroy())

  it('splits a 20-row table into 4 chunks when rendered height (600px) exceeds page content (200px)', async () => {
    s = setup(makeBigTableDoc(20), { pageContentPx: 200 })

    // Force a measurement pass: dispatch an empty transaction so appendTransaction runs.
    s.inst.editor.view.dispatch(s.inst.editor.state.tr)
    await s.awaitSplit()

    const json = s.inst.editor.getJSON()
    const blockNodes = (json as any).content
    const tableNodes = blockNodes.filter((n: any) => n.type === 'table')
    // Deferred multi-split (#192 + multi-table): the queueMicrotask runs
    // AFTER view.updateState so the DOM is current, then dispatches a single
    // tr that produces all chunks. 600 px / 180 px-per-chunk = 4 chunks of
    // 6,6,6,2 rows.
    expect(tableNodes.length).toBe(4)
    expect(tableNodes[0].content.length).toBe(6)
    expect(tableNodes[1].content.length).toBe(6)
    expect(tableNodes[2].content.length).toBe(6)
    expect(tableNodes[3].content.length).toBe(2)
    // Total row count is preserved (the bug from #192 was 2× duplication).
    const totalRows = tableNodes.reduce((acc: number, t: any) => acc + t.content.length, 0)
    expect(totalRows).toBe(20)
    // Paragraph separators between chunks — kept here as a guard against
    // accidentally re-introducing them. Empty paragraphs in the middle of a
    // chain were ~38 px each at default `.ProseMirror p` styling and pushed
    // the last chunk onto a fresh page (issue #193 "empty space above 2nd
    // table"). Adjacent tables render flush; the page-break decoration
    // provides visual separation when it matters.
    const separatorsBetweenTables = blockNodes.filter((n: any, i: number) =>
      n.type === 'paragraph' &&
      i > 0 && blockNodes[i - 1].type === 'table' &&
      i < blockNodes.length - 1 && blockNodes[i + 1].type === 'table',
    )
    expect(separatorsBetweenTables.length).toBe(0)
  })

  it('is a no-op when the page-content CSS variable is absent', () => {
    s = setup(makeBigTableDoc(20), { pageContentPx: null })

    s.inst.editor.view.dispatch(s.inst.editor.state.tr)

    const json = s.inst.editor.getJSON()
    const tableNodes = (json as any).content.filter((n: any) => n.type === 'table')
    expect(tableNodes.length).toBe(1)
    expect(tableNodes[0].content.length).toBe(20)
  })

  it('does not split a table that already fits on one page', () => {
    // 5 rows * 30px = 150px, fits in 200px page-content area.
    s = setup(makeBigTableDoc(5), { pageContentPx: 200 })

    s.inst.editor.view.dispatch(s.inst.editor.state.tr)

    const json = s.inst.editor.getJSON()
    const tableNodes = (json as any).content.filter((n: any) => n.type === 'table')
    expect(tableNodes.length).toBe(1)
    expect(tableNodes[0].content.length).toBe(5)
  })

  it('produces all splits via the deferred microtask (#192 single-transaction multi-split)', async () => {
    s = setup(makeBigTableDoc(20), { pageContentPx: 200 })

    // One empty dispatch schedules the deferred split pass via queueMicrotask.
    // awaitSplit yields until the queueMicrotask fires AND the dispatched
    // split tr lands.
    s.inst.editor.view.dispatch(s.inst.editor.state.tr)
    await s.awaitSplit()

    const tables = (s.inst.editor.getJSON() as any).content.filter((n: any) => n.type === 'table')
    // 20 rows × 30 px = 600 px total; each chunk must fit in 200 px → max 6 rows.
    // Result: 4 tables of 6,6,6,2 rows.
    expect(tables.length).toBe(4)
    // Total rows preserved (the bug from #192 was 2× duplication).
    const totalRows = tables.reduce((acc: number, t: any) => acc + t.content.length, 0)
    expect(totalRows).toBe(20)
    // Every chunk except possibly the last one should fit in the page-content area
    // (≤ 6 rows × 30 px = 180 px ≤ 200 px).
    for (let i = 0; i < tables.length - 1; i++) {
      expect(tables[i].content.length).toBeLessThanOrEqual(6)
      expect(tables[i].attrs.tablePageSplit).toBe('head')
    }
    expect(tables[tables.length - 1].attrs.tablePageSplit).toBeNull()
  })

  it('is not active when the plugin is not registered (default behavior unchanged)', () => {
    s = setup(makeBigTableDoc(20), { split: false, pageContentPx: 200 })
    s.inst.editor.view.dispatch(s.inst.editor.state.tr)
    const json = s.inst.editor.getJSON()
    const tableNodes = (json as any).content.filter((n: any) => n.type === 'table')
    expect(tableNodes.length).toBe(1)
    expect(tableNodes[0].content.length).toBe(20)
  })

  it('preserves total row count across splits (issue #192 regression guard)', async () => {
    // Issue #192: 30-row pasted table was rendered as 20 tables × 3 rows = 60 rows.
    // The deferred microtask approach must preserve total rows across inputs.
    for (const rowCount of [10, 30, 60, 100]) {
      s = setup(makeBigTableDoc(rowCount), { pageContentPx: 200 })

      s.inst.editor.view.dispatch(s.inst.editor.state.tr)
      await s.awaitSplit()

      const tables = (s.inst.editor.getJSON() as any).content.filter(
        (n: any) => n.type === 'table',
      )
      const totalRows = tables.reduce(
        (acc: number, t: any) => acc + t.content.length,
        0,
      )
      expect(totalRows).toBe(rowCount)
    }
  })

  it('splits every over-tall table in a multi-table paste (deferred pass scans the full DOM-updated doc)', async () => {
    // Regression for the Jam `a3238e4d-…` report: pasting a Google Doc with
    // two tracker tables separated by paragraphs. Earlier sync-pass fixes
    // only split the first table because the DOM was stale during the first
    // appendTransaction; the deferred queueMicrotask runs AFTER view.updateState
    // so every newly added table is measurable.
    s = setup({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'before' }] },
        ...makeBigTableDoc(20).content.slice(1, 2),
        { type: 'paragraph', content: [{ type: 'text', text: 'gap' }] },
        ...makeBigTableDoc(20).content.slice(1, 2),
        { type: 'paragraph', content: [{ type: 'text', text: 'after' }] },
      ],
    }, { pageContentPx: 200 })

    s.inst.editor.view.dispatch(s.inst.editor.state.tr)
    await s.awaitSplit()

    const blocks = (s.inst.editor.getJSON() as any).content
    const tableNodes = blocks.filter((n: any) => n.type === 'table')
    // Two source tables × 4 chunks per source = 8 tables total.
    expect(tableNodes.length).toBe(8)
    // Total row count is preserved per source (20 + 20 = 40 rows).
    const totalRows = tableNodes.reduce(
      (acc: number, t: any) => acc + t.content.length,
      0,
    )
    expect(totalRows).toBe(40)
    // Both source tables split, but NOT identically: table 1 starts at the
    // top of a fresh page (full 200px budget) → 6,6,6,2. Table 2 starts
    // mid-page after table 1's last chunk (60px consumed, 140px left) →
    // 4,6,6,4. The old broken behavior measured table 2 against stale DOM
    // and produced [2,2]; the fix tracks a running cursor so table 2 gets
    // the correct reduced head budget.
    const tailSizes = [
      tableNodes[3].content.length,
      tableNodes[7].content.length,
    ]
    expect(tailSizes).toEqual([2, 4])
  })
})