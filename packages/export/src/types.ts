import type { Schema } from 'prosemirror-model'

export type ExportFormat = 'markdown' | 'html' | 'html-zip' | 'txt' | 'docx' | 'pdf' | 'odt' | 'rtf'

export interface PageGeometry {
  sizeId: string
  pageWidth: number
  pageHeight: number
  margins: { top: number; bottom: number; left: number; right: number }
  orientation?: 'portrait' | 'landscape'
}

export interface ExportContext {
  doc: object
  title: string
  geometry?: PageGeometry
  resolveImage?: (src: string) => Promise<{ data: Uint8Array; mime: string; width?: number; height?: number }>
  /** Rendered citations + bibliography for citation/bibliography nodes (Phase 6D). */
  citation?: CitationExportPort
}

export interface ExportResult {
  blob: Blob
  filename: string
  mime: string
}

/**
 * Host-injected citation renderer (Phase 6D). The export package deliberately
 * knows nothing about citeproc — the host (which owns the CiteEngine) hands
 * over rendered strings: in-text/note text per citation cluster id, and the
 * formatted bibliography entries.
 */
export interface CitationExportPort {
  /** Rendered (sanitized HTML) in-text citation or footnote body for a cluster id. */
  renderCitation: (citationId: string) => string
  /** Formatted bibliography entries (sanitized HTML), in style order. */
  getBibliography: () => string[]
}

export interface EditorLike {
  schema: Schema
  getHTML: () => string
  getText: () => string
  getJSON: () => Record<string, unknown>
  view: { dom: HTMLElement }
}
