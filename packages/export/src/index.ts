import type { ExportFormat, ExportContext, EditorLike } from './types.js'
import {
  filenameFromTitle,
  triggerDownload,
  wrapHtmlDocument,
  jsonToMarkdown,
  plainTextFromHtml,
} from './utils.js'
import { generateRtf } from './rtf.js'
import { generateOdt, exportHtmlZip } from './odt.js'
import { exportDocx } from './docx/index.js'

export type { ExportFormat, ExportContext, ExportResult, EditorLike, PageGeometry } from './types.js'
export { filenameFromTitle, wrapHtmlDocument, plainTextFromHtml, jsonToMarkdown } from './utils.js'
export { generateRtf } from './rtf.js'
export { generateOdt, exportHtmlZip } from './odt.js'
export { exportDocx } from './docx/index.js'

export async function exportDocument(format: ExportFormat, editor: EditorLike, title: string, ctx?: Partial<ExportContext>): Promise<void> {
  const html = editor.getHTML()
  const json = editor.getJSON()
  const context: ExportContext = {
    doc: json,
    title,
    ...ctx,
  }

  switch (format) {
    case 'markdown': {
      let markdown: string
      try {
        markdown = jsonToMarkdown(editor.schema, json)
      } catch {
        markdown = plainTextFromHtml(html)
      }
      const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
      triggerDownload(blob, filenameFromTitle(title, 'md'))
      break
    }
    case 'txt': {
      const text = plainTextFromHtml(html)
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
      triggerDownload(blob, filenameFromTitle(title, 'txt'))
      break
    }
    case 'html': {
      const blob = new Blob([wrapHtmlDocument(title, html)], { type: 'text/html;charset=utf-8' })
      triggerDownload(blob, filenameFromTitle(title, 'html'))
      break
    }
    case 'html-zip': {
      const blob = await exportHtmlZip(title, html)
      triggerDownload(blob, filenameFromTitle(title, 'zip'))
      break
    }
    case 'docx': {
      const blob = await exportDocx(context)
      triggerDownload(blob, filenameFromTitle(title, 'docx'))
      break
    }
    case 'pdf': {
      window.print()
      break
    }
    case 'odt': {
      const blob = await generateOdt(title, html)
      triggerDownload(blob, filenameFromTitle(title, 'odt'))
      break
    }
    case 'rtf': {
      const rtf = generateRtf(title, html)
      const blob = new Blob([rtf], { type: 'application/rtf;charset=utf-8' })
      triggerDownload(blob, filenameFromTitle(title, 'rtf'))
      break
    }
    default:
      throw new Error(`Unsupported export format: ${format}`)
  }
}
