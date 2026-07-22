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
}

export interface ExportResult {
  blob: Blob
  filename: string
  mime: string
}

export interface EditorLike {
  schema: Schema
  getHTML: () => string
  getText: () => string
  getJSON: () => Record<string, unknown>
  view: { dom: HTMLElement }
}
