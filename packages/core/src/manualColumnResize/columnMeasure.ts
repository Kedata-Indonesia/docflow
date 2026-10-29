/**
 * Width measurement for `ManualColumnResize`.
 *
 * Everything here only reads the DOM: the drag session owns all state.
 */

const FALLBACK_COLUMN_WIDTH = 100
const FALLBACK_TABLE_WIDTH = 614

/** Classes of the ancestors we accept as the table's content box. */
const CONTENT_BOX_CLASSES = [
  'docs-editor__paper',
  'docs-editor-page',
  'ProseMirror',
  'rm-with-pagination',
]

/** Widest box the table may occupy: the nearest known paper/editor ancestor. */
export function getMaxContainerWidth(tableEl: HTMLElement): number {
  let curr: HTMLElement | null = tableEl.parentElement
  while (curr) {
    const style = window.getComputedStyle(curr)
    const paddingLeft = parseFloat(style.paddingLeft) || 0
    const paddingRight = parseFloat(style.paddingRight) || 0
    const availWidth = curr.clientWidth - paddingLeft - paddingRight
    const isContentBox = CONTENT_BOX_CLASSES.some((name) => curr?.classList.contains(name))
    if (availWidth > 100 && isContentBox) return availWidth
    curr = curr.parentElement
  }
  return tableEl.parentElement?.clientWidth || FALLBACK_TABLE_WIDTH
}

/** Rendered width of a column, taken from its first-row cell. */
export function initialWidth(table: HTMLElement, colIdx: number): number {
  const firstRow = table.querySelector('tr')
  if (!firstRow) return FALLBACK_COLUMN_WIDTH
  const cell = firstRow.children[colIdx] as HTMLElement | undefined
  if (!cell) return FALLBACK_COLUMN_WIDTH
  return Math.round(cell.getBoundingClientRect().width)
    || cell.offsetWidth
    || FALLBACK_COLUMN_WIDTH
}

/**
 * Current width of every column. `<colgroup>` wins (it drives layout under
 * `table-layout: fixed`); columns without an explicit width are measured from
 * their first-row cell so no column is left un-sized.
 */
export function collectColumnWidths(table: HTMLElement): {
  widths: number[]
  totalCols: number
} {
  const cols = table.querySelectorAll('colgroup col')
  const totalCols = cols.length || table.querySelector('tr')?.children.length || 0
  const widths: number[] = []
  for (let c = 0; c < totalCols; c++) {
    const colEl = cols[c] as HTMLElement | undefined
    const width = colEl ? parseFloat(colEl.style.width) : 0
    widths[c] = width || initialWidth(table, c)
  }
  return { widths, totalCols }
}
