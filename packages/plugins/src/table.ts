import { definePlugin } from '@kedata-indonesia/docflow-core'
import { mergeAttributes } from '@tiptap/core'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'

const CustomTable = Table.extend({
  renderHTML({ node, HTMLAttributes }) {
    let colCount = 0
    const firstRow = node.firstChild
    if (firstRow) {
      firstRow.forEach(cell => {
        colCount += cell.attrs.colspan || 1
      })
    }

    const cols: any[] = []
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
    if (hasExplicitWidths && totalWidth > 0) {
      const existingStyle = tableAttrs.style || ''
      tableAttrs.style = existingStyle ? `${existingStyle}; width: ${totalWidth}px !important` : `width: ${totalWidth}px !important`
    }

    return [
      'table',
      tableAttrs,
      ['colgroup', ...cols],
      ['tbody', 0],
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
          const validWidths = attributes.colwidth.filter((w: any) => typeof w === 'number' && w > 0)
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
          const validWidths = attributes.colwidth.filter((w: any) => typeof w === 'number' && w > 0)
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
