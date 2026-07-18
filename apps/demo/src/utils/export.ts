import type JSZipType from 'jszip'
import type { Schema } from 'prosemirror-model'
import { Node as PMNode } from 'prosemirror-model'
import { defaultMarkdownSerializer } from 'prosemirror-markdown'
import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Packer,
  UnderlineType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  convertInchesToTwip,
  BorderStyle,
} from 'docx'
import JSZip from 'jszip'

export type ExportFormat = 'markdown' | 'html' | 'html-zip' | 'txt' | 'docx' | 'pdf' | 'odt' | 'rtf'

interface EditorLike {
  schema: Schema
  getHTML: () => string
  getText: () => string
  getJSON: () => Record<string, unknown>
  view: { dom: HTMLElement }
}

function filenameFromTitle(title: string, ext: string) {
  const safe = (title || 'Untitled Document').replace(/[^a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF _.-]/g, '').trim() || 'Untitled Document'
  return `${safe}.${ext}`
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

function wrapHtmlDocument(title: string, bodyHtml: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; max-width: 210mm; margin: 0 auto; padding: 20mm; color: #1f2937; }
h1,h2,h3,h4 { color: #111827; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; }
th, td { border: 1px solid #d1d5db; padding: 0.5em; text-align: left; }
blockquote { border-left: 4px solid #e5e7eb; padding-left: 1em; margin-left: 0; color: #4b5563; }
code { background: #f3f4f6; padding: 0.2em 0.4em; border-radius: 4px; }
pre { background: #f3f4f6; padding: 1em; border-radius: 6px; overflow-x: auto; }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`
}

function jsonToMarkdown(schema: Schema, json: Record<string, unknown>) {
  const node = PMNode.fromJSON(schema, json)
  return defaultMarkdownSerializer.serialize(node)
}

function plainTextFromHtml(html: string) {
  const div = document.createElement('div')
  div.innerHTML = html
  return div.innerText || div.textContent || ''
}

function generateRtf(title: string, html: string) {
  const text = plainTextFromHtml(html)
  const rtfBody = text
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\r?\n/g, '\\par\n')
  return `{\\rtf1\\ansi\\ansicpg1252\\deff0\\nouicompat\\deflang1033{\\fonttbl{\\f0\\fnil\\fcharset0 Arial;}}
{\\*\\generator Riched20 10.0.19041}\\viewkind4\\uc1 
\\pard\\f0\\fs22 ${title}\\par\\par
${rtfBody}
\\par
}
`
}

async function generateOdt(title: string, html: string): Promise<Blob> {
  const text = plainTextFromHtml(html)
  const zip = new JSZip() as JSZipType

  const escapedText = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .split(/\r?\n/)
    .map((line) => `<text:p>${line || ' '}</text:p>`)
    .join('')

  const contentXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0">
  <office:body>
    <office:text>
      <text:p text:style-name="Title">${title}</text:p>
      ${escapedText}
    </office:text>
  </office:body>
</office:document-content>`

  const stylesXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0">
  <style:styles>
    <style:style style:name="Title" style:family="paragraph">
      <style:text-properties fo:font-size="18pt" fo:font-weight="bold"/>
    </style:style>
  </style:styles>
</office:document-styles>`

  const metaXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <office:meta><dc:title>${title}</dc:title></office:meta>
</office:document-meta>`

  const manifestXml = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">
  <manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>
  <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
  <manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
  <manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`

  zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' })
  zip.file('content.xml', contentXml)
  zip.file('styles.xml', stylesXml)
  zip.file('meta.xml', metaXml)
  zip.file('META-INF/manifest.xml', manifestXml)

  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.oasis.opendocument.text' })
}

async function exportHtmlZip(title: string, html: string) {
  const zip = new JSZip() as JSZipType
  zip.file(`${title}.html`, wrapHtmlDocument(title, html))
  return zip.generateAsync({ type: 'blob', mimeType: 'application/zip' })
}

function inferHeadingLevel(tagName: string): (typeof HeadingLevel)[keyof typeof HeadingLevel] | undefined {
  switch (tagName) {
    case 'H1': return HeadingLevel.HEADING_1
    case 'H2': return HeadingLevel.HEADING_2
    case 'H3': return HeadingLevel.HEADING_3
    case 'H4': return HeadingLevel.HEADING_4
    case 'H5': return HeadingLevel.HEADING_5
    case 'H6': return HeadingLevel.HEADING_6
    default: return undefined
  }
}

function textAlignFromStyle(el: HTMLElement) {
  const align = el.style.textAlign || (el.getAttribute('align') as string)
  if (!align) return undefined
  switch (align) {
    case 'left': return AlignmentType.LEFT
    case 'center': return AlignmentType.CENTER
    case 'right': return AlignmentType.RIGHT
    case 'justify': return AlignmentType.JUSTIFIED
    default: return undefined
  }
}

function childrenToTextRuns(node: globalThis.Node): TextRun[] {
  const runs: TextRun[] = []
  node.childNodes.forEach((child) => {
    if (child.nodeType === globalThis.Node.TEXT_NODE) {
      const text = child.textContent || ''
      if (text) runs.push(new TextRun({ text }))
    } else if (child.nodeType === globalThis.Node.ELEMENT_NODE) {
      const el = child as HTMLElement
      const tag = el.tagName
      if (tag === 'BR') {
        runs.push(new TextRun({ text: '', break: 1 }))
      } else {
        const text = el.textContent || ''
        if (!text) return
        const bold = tag === 'STRONG' || tag === 'B'
        const italic = tag === 'EM' || tag === 'I'
        const underline = tag === 'U'
        const strike = tag === 'S' || tag === 'DEL' || tag === 'STRIKE'
        const code = tag === 'CODE'
        runs.push(new TextRun({
          text,
          bold,
          italics: italic,
          underline: underline ? { type: UnderlineType.SINGLE } : undefined,
          strike: strike ? true : undefined,
          font: code ? 'Courier New' : undefined,
        }))
      }
    }
  })
  return runs
}

function elementToDocxParagraph(el: HTMLElement): Paragraph | null {
  const tag = el.tagName
  const align = textAlignFromStyle(el)
  const children = childrenToTextRuns(el)

  if (tag === 'P') {
    return new Paragraph({ children, alignment: align })
  }
  const heading = inferHeadingLevel(tag)
  if (heading) {
    return new Paragraph({ children, heading, alignment: align })
  }
  if (tag === 'BLOCKQUOTE') {
    return new Paragraph({ children, indent: { left: 720 }, alignment: align })
  }
  if (tag === 'PRE' || tag === 'CODE') {
    return new Paragraph({ children, style: 'Code', alignment: align })
  }
  return null
}

function tableToDocxTable(el: HTMLTableElement): Table {
  const rows: TableRow[] = []
  el.querySelectorAll('tr').forEach((tr, rowIdx) => {
    const cells: TableCell[] = []
    tr.querySelectorAll('td, th').forEach((cell) => {
      const text = cell.textContent || ''
      cells.push(new TableCell({
        children: [new Paragraph(text)],
        shading: rowIdx === 0 && cell.tagName === 'TH' ? { fill: 'E5E7EB' } : undefined,
        borders: {
          top: { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' },
          left: { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' },
          right: { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' },
        },
      }))
    })
    if (cells.length) rows.push(new TableRow({ children: cells }))
  })
  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
  })
}

function listToDocxParagraphs(el: HTMLElement): Paragraph[] {
  const isOrdered = el.tagName === 'OL'
  const paragraphs: Paragraph[] = []
  el.querySelectorAll(':scope > li').forEach((li, index) => {
    const text = li.textContent || ''
    const prefix = isOrdered ? `${index + 1}. ` : '• '
    paragraphs.push(new Paragraph({
      children: [new TextRun({ text: prefix + text })],
    }))
  })
  return paragraphs
}

function htmlToDocxDocument(title: string, html: string): Document {
  const container = document.createElement('div')
  container.innerHTML = html

  const children: (Paragraph | Table)[] = []
  container.childNodes.forEach((node) => {
    if (node.nodeType !== globalThis.Node.ELEMENT_NODE) return
    const el = node as HTMLElement
    const tag = el.tagName

    if (tag === 'UL' || tag === 'OL') {
      children.push(...listToDocxParagraphs(el))
    } else if (tag === 'TABLE') {
      children.push(tableToDocxTable(el as HTMLTableElement))
    } else if (tag === 'HR') {
      children.push(new Paragraph({
        border: { bottom: { color: 'D1D5DB', size: 6, style: BorderStyle.SINGLE } },
      }))
    } else if (tag === 'DIV') {
      el.childNodes.forEach((child) => {
        if ((child as HTMLElement).tagName) {
          const p = elementToDocxParagraph(child as HTMLElement)
          if (p) children.push(p)
        }
      })
    } else {
      const p = elementToDocxParagraph(el)
      if (p) children.push(p)
    }
  })

  if (children.length === 0) {
    children.push(new Paragraph(''))
  }

  return new Document({
    title,
    styles: {
      paragraphStyles: [
        {
          id: 'Code',
          name: 'Code',
          basedOn: 'Normal',
          run: { font: 'Courier New' },
        },
      ],
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(1),
            right: convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left: convertInchesToTwip(1),
          },
        },
      },
      children,
    }],
  })
}

export async function exportDocument(format: ExportFormat, editor: EditorLike, title: string) {
  const html = editor.getHTML()

  switch (format) {
    case 'markdown': {
      // Compute lazily + guard: the default Markdown serializer throws on
      // nodes/marks it doesn't support (underline, strike, font-size, tables,
      // task lists, pagination). Fall back to plain text so it still downloads.
      let markdown: string
      try {
        markdown = jsonToMarkdown(editor.schema, editor.getJSON())
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
      const doc = htmlToDocxDocument(title, html)
      const blob = await Packer.toBlob(doc)
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

export const EXPORT_FORMATS: { id: ExportFormat; ext: string; labelKey: string }[] = [
  { id: 'docx', ext: 'docx', labelKey: 'header.docx' },
  { id: 'pdf', ext: 'pdf', labelKey: 'header.pdf' },
  { id: 'odt', ext: 'odt', labelKey: 'header.odt' },
  { id: 'txt', ext: 'txt', labelKey: 'header.text' },
  { id: 'rtf', ext: 'rtf', labelKey: 'header.rtf' },
  { id: 'html-zip', ext: 'zip', labelKey: 'header.htmlZip' },
  { id: 'html', ext: 'html', labelKey: 'header.html' },
  { id: 'markdown', ext: 'md', labelKey: 'header.markdown' },
]
