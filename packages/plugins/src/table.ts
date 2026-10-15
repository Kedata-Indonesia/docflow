import { definePlugin } from '@kedata-indonesia/docflow-core'
import { mergeAttributes } from '@tiptap/core'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import type { DOMOutputSpec } from '@tiptap/pm/model'
import { Plugin, TextSelection } from '@tiptap/pm/state'

const CustomTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      // Marker used by the experimental `tablePageSplitPlugin` to tag the
      // head of a split pair. Backwards-compatible (default null) so docs
      // without this attr round-trip cleanly. See
      // packages/plugins/src/tablePageSplit.ts.
      tablePageSplit: {
        default: null,
        parseHTML: () => null,
        renderHTML: () => ({}),
      },
    }
  },
  renderHTML({ node, HTMLAttributes }) {
    let colCount = 0
    const firstRow = node.firstChild
    if (firstRow) {
      firstRow.forEach(cell => {
        colCount += cell.attrs.colspan || 1
      })
    }

    const cols: DOMOutputSpec[] = []
    let totalWidth = 0
    let hasExplicitWidths = false
    if (colCount > 0) {
      for (let i = 0; i < colCount; i++) {
        let width = null
        if (firstRow) {
          let currentColIdx = 0
          firstRow.forEach(cell => {
            const colspan = cell.attrs.colspan || 1
            if (i >= currentColIdx && i < currentColIdx + colspan) {
              const colwidth = cell.attrs.colwidth
              if (colwidth && Array.isArray(colwidth)) {
                const indexInCell = i - currentColIdx
                const w = colwidth[indexInCell]
                if (typeof w === 'number' && w > 0) {
                  width = w
                }
              }
            }
            currentColIdx += colspan
          })
        }
        if (width) {
          totalWidth += width
          hasExplicitWidths = true
        }
        cols.push([
          'col',
          width ? { style: `width: ${width}px !important`, width: String(width) } : {},
        ])
      }
    }

    const tableAttrs = mergeAttributes(HTMLAttributes)
    // Mark every rendered table with data-tps-splittable so the
    // patched PaginationPlus convergence guard lets the page count grow
    // past tables (see patches/tiptap-pagination-plus@3.1.0.patch and
    // packages/plugins/src/tablePageSplit.ts). Only the tail of a
    // tablePageSplitPlugin pair is the case where this attribute *should*
    // unblock pagination; for the head and for ordinary tables it is a
    // harmless signal because the head sits on an earlier page and the
    // guard fires only on the *last* editor element. The attribute is
    // always rendered to keep the docflow CSS/JS contract simple.
    tableAttrs['data-tps-splittable'] = ''
    if (hasExplicitWidths && totalWidth > 0) {
      const existingStyle = tableAttrs.style || ''
      tableAttrs.style = existingStyle ? `${existingStyle}; width: ${totalWidth}px !important` : `width: ${totalWidth}px !important`
      // Mark the table as having explicit column widths so CSS uses
      // table-layout: fixed (required by ManualColumnResize, which drives
      // layout from <colgroup col> widths). Tables WITHOUT explicit widths
      // fall back to table-layout: auto so columns size to content (long
      // text columns get wider instead of wrapping and inflating row height
      // — see docs/plans/clipboard-paste-pipeline-plan.md, paste table fix).
      tableAttrs['data-colwidth'] = 'explicit'
    }

    return [
      'table',
      tableAttrs,
      ['colgroup', ...cols],
      ['tbody', 0],
    ]
  },

  // #139: double-clicking an EMPTY cell resolved the caret to a neighbouring
  // cell — ProseMirror's default dblclick word-selection has no text to land on
  // in a cell whose only content is a trailing <br>. When the resolved position
  // is not inside the cell under the pointer, place the caret at that cell's
  // start instead. Non-empty cells keep the default (select the word).
  addProseMirrorPlugins() {
    const parent = this.parent?.() ?? []
    return [
      ...parent,
      new Plugin({
        props: {
          handleDoubleClick(view, pos, event) {
            const cell = (event.target as HTMLElement | null)?.closest?.('td, th') ?? null
            if (!cell) return false

            // Already inside the pointed-at cell → default behaviour.
            const $pos = view.state.doc.resolve(pos)
            for (let d = $pos.depth; d > 0; d--) {
              const name = $pos.node(d).type.name
              if (name === 'tableCell' || name === 'tableHeader') return false
            }

            const cellPos = view.posAtDOM(cell, 0)
            const selection = TextSelection.near(view.state.doc.resolve(cellPos), 1)
            view.dispatch(view.state.tr.setSelection(selection))
            return true
          },
        },
      }),
    ]
  },
})

const CustomTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      colwidth: {
        default: null,
        parseHTML: element => {
          const width = element.getAttribute('width') || element.style.width
          if (width) {
            const parsed = parseInt(width, 10)
            return isNaN(parsed) || parsed <= 0 ? null : [parsed]
          }
          const colwidth = element.getAttribute('colwidth')
          return colwidth ? colwidth.split(',').map(w => parseInt(w, 10)).filter(w => !isNaN(w) && w > 0) : null
        },
        renderHTML: attributes => {
          if (!attributes.colwidth || !Array.isArray(attributes.colwidth) || attributes.colwidth.length === 0) {
            return {}
          }
          const validWidths = attributes.colwidth.filter((w: unknown) => typeof w === 'number' && w > 0)
          if (validWidths.length === 0) {
            return {}
          }
          const w = validWidths[0]
          return {
            colwidth: validWidths.join(','),
            style: `width: ${w}px !important`,
            width: String(w),
          }
        },
      },
    }
  },
})

const CustomTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      colwidth: {
        default: null,
        parseHTML: element => {
          const width = element.getAttribute('width') || element.style.width
          if (width) {
            const parsed = parseInt(width, 10)
            return isNaN(parsed) || parsed <= 0 ? null : [parsed]
          }
          const colwidth = element.getAttribute('colwidth')
          return colwidth ? colwidth.split(',').map(w => parseInt(w, 10)).filter(w => !isNaN(w) && w > 0) : null
        },
        renderHTML: attributes => {
          if (!attributes.colwidth || !Array.isArray(attributes.colwidth) || attributes.colwidth.length === 0) {
            return {}
          }
          const validWidths = attributes.colwidth.filter((w: unknown) => typeof w === 'number' && w > 0)
          if (validWidths.length === 0) {
            return {}
          }
          const w = validWidths[0]
          return {
            colwidth: validWidths.join(','),
            style: `width: ${w}px !important`,
            width: String(w),
          }
        },
      },
    }
  },
})

export const tablePlugin = definePlugin({
  id: 'table',
  tiptapExtensions: [
    CustomTable.configure({ resizable: false }),
    TableRow,
    CustomTableCell,
    CustomTableHeader,
  ],
  toolbar: [
    { id: 'insert-table', label: 'Insert Table', action: 'insertTable', args: [{ rows: 3, cols: 3, withHeaderRow: true }], iconComponent: 'Table' },
  ],
  slashCommands: [{ name: 'Table', command: 'insertTable' }],
})
