import { PluginKey } from '@tiptap/pm/state'

export const PLUGIN_KEY = new PluginKey('docflow/table-page-split')

/** `tablePageSplit` attr value on the head chunk of a split table. */
export const SPLIT_MARK = 'head'

/** Safety net: a single table never splits into more chunks than this. */
export const MAX_SPLIT_DEPTH = 16

/**
 * Minimal structural view of the PaginationPlus editor storage this plugin
 * reads. Fields are optional because TipTap populates storage lazily and this
 * plugin is only a consumer of it.
 */
export interface PaginationPlusStorageLike {
  pageHeight?: number
  marginTop?: number
  marginBottom?: number
  contentMarginTop?: number
  contentMarginBottom?: number
  headerHeight?: { get: (page: number) => number | undefined }
  footerHeight?: { get: (page: number) => number | undefined }
}

/** Anything exposing PaginationPlus storage (the TipTap editor, or null). */
export interface EditorWithPaginationStorage {
  storage?: { PaginationPlus?: PaginationPlusStorageLike }
}

/** Measured height of one `<tr>`, plus the running total down the table. */
export interface RowMeasurement {
  rowIndex: number
  heightPx: number
  cumulativePx: number
}
