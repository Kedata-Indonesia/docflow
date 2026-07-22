import { Table, TableRow, TableCell, Paragraph, TextRun, WidthType, BorderStyle } from 'docx'
import type { PmNode } from './nodes.js'

function cellToParagraph(node: PmNode): Paragraph {
  const runs: TextRun[] = []
  for (const child of node.content || []) {
    if (child.type === 'paragraph' || child.type === 'text') {
      if (child.type === 'text') {
        runs.push(new TextRun({ text: child.text || '' }))
      } else {
        for (const inline of child.content || []) {
          if (inline.type === 'text') {
            runs.push(new TextRun({ text: inline.text || '' }))
          }
        }
      }
    }
  }
  return new Paragraph({ children: runs.length > 0 ? runs : [new TextRun('')] })
}

export function tableToDocxTable(node: PmNode): Table | null {
  if (node.type !== 'table' || !node.content) return null

  const rows: TableRow[] = []
  for (const rowNode of node.content) {
    if (rowNode.type !== 'tableRow' || !rowNode.content) continue
    const cells: TableCell[] = []
    for (const cellNode of rowNode.content) {
      if (cellNode.type !== 'tableCell' && cellNode.type !== 'tableHeader') continue
      const isHeader = cellNode.type === 'tableHeader'
      cells.push(new TableCell({
        children: [cellToParagraph(cellNode)],
        shading: isHeader ? { fill: 'E5E7EB' } : undefined,
        borders: {
          top: { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' },
          left: { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' },
          right: { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' },
        },
      }))
    }
    if (cells.length > 0) rows.push(new TableRow({ children: cells }))
  }

  if (rows.length === 0) return null
  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
  })
}
