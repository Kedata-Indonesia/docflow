import { Table, TableRow, TableCell, Paragraph, WidthType, BorderStyle } from 'docx'
import { mapBlockNode, type PmNode, type WalkContext } from './nodes.js'

/**
 * A table cell's children are blocks, not inline text: mapping them through the
 * shared block mapper keeps marks, citations, footnotes, equations, lists,
 * images and nested tables (issue #382). DOCX requires at least one paragraph.
 */
function cellChildren(cellNode: PmNode, walkCtx?: WalkContext): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = []
  for (const child of cellNode.content ?? []) {
    if (child.type === 'table') {
      const nested = tableToDocxTable(child, walkCtx)
      if (nested) children.push(nested)
      continue
    }
    children.push(...mapBlockNode(child, undefined, walkCtx))
  }
  if (children.length === 0) children.push(new Paragraph(''))
  return children
}

/** ProseMirror table attrs are `colspan`/`rowspan`; accept the camelCase form too. */
function span(value: unknown): number | undefined {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 1 ? parsed : undefined
}

export function tableToDocxTable(node: PmNode, walkCtx?: WalkContext): Table | null {
  if (node.type !== 'table' || !node.content) return null

  const rows: TableRow[] = []
  for (const rowNode of node.content) {
    if (rowNode.type !== 'tableRow' || !rowNode.content) continue
    const cells: TableCell[] = []
    for (const cellNode of rowNode.content) {
      if (cellNode.type !== 'tableCell' && cellNode.type !== 'tableHeader') continue
      const isHeader = cellNode.type === 'tableHeader'
      cells.push(new TableCell({
        children: cellChildren(cellNode, walkCtx),
        columnSpan: span(cellNode.attrs?.colspan ?? cellNode.attrs?.columnSpan),
        rowSpan: span(cellNode.attrs?.rowspan ?? cellNode.attrs?.rowSpan),
        shading: isHeader ? { fill: 'E5E7EB' } : undefined,
        borders: {
          top: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
          bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
          left: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
          right: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
        },
      }))
    }
    if (cells.length > 0) rows.push(new TableRow({ children: cells }))
  }

  if (rows.length === 0) return null
  return new Table({
    rows,
    width: { size: 5000, type: WidthType.DXA }, // DXA units for full page width
  })
}
