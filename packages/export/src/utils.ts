import type { Schema } from 'prosemirror-model'
import { Node as PMNode } from 'prosemirror-model'
import { defaultMarkdownSerializer } from 'prosemirror-markdown'

export function filenameFromTitle(title: string, ext: string): string {
  const safe = (title || 'Untitled Document')
    .replace(/[^a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF _.-]/g, '')
    .trim() || 'Untitled Document'
  return `${safe}.${ext}`
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export function wrapHtmlDocument(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; max-width: 210mm; margin: 0 auto; padding: 20mm; color: #1f2937; }
h1,h2,h3,h4,h5,h6 { color: #111827; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; }
th, td { border: 1px solid #d1d5db; padding: 0.5em; text-align: left; }
blockquote { border-left: 4px solid #e5e7eb; padding-left: 1em; margin-left: 0; color: #4b5563; }
code { background: #f3f4f6; padding: 0.2em 0.4em; border-radius: 4px; }
pre { background: #f3f4f6; padding: 1em; border-radius: 6px; overflow-x: auto; }
img { max-width: 100%; height: auto; }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`
}

export function jsonToMarkdown(schema: Schema, json: Record<string, unknown>): string {
  const node = PMNode.fromJSON(schema, json)
  return defaultMarkdownSerializer.serialize(node)
}

export function plainTextFromHtml(html: string): string {
  const div = document.createElement('div')
  div.innerHTML = html
  return div.innerText || div.textContent || ''
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
