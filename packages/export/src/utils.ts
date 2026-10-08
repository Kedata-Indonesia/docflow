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

// Block-level tags separated by a blank line (paragraph semantics).
const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'div', 'dl', 'fieldset',
  'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header',
  'hr', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'tbody', 'tfoot',
  'thead', 'ul',
])

// Line-level tags (list items, table rows, description terms) separate with a
// single newline, matching browser `innerText`.
const LINE_TAGS = new Set(['li', 'tr', 'dt', 'dd'])

// Table cells read as columns and separate with a tab, like `innerText`.
const CELL_TAGS = new Set(['td', 'th'])

// Headings are block-level but read as part of the flow: they open a new line
// without inserting a blank line before the following paragraph.
const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

const SKIP_TAGS = new Set(['script', 'style', 'template', 'noscript', 'head', 'title'])

function ensureSeparator(out: string[], separator: '\n' | '\t'): void {
  if (out.length === 0) return
  const last = out[out.length - 1]
  if (last === separator) return
  if (separator === '\t' && last === '\n') return
  out.push(separator)
}

/**
 * A `<pre>` (code block) keeps its whitespace verbatim. The HTML parser turns
 * raw NUL into U+FFFD, so a `NUL<index>NUL` placeholder is safe: the separator
 * normalization below skips it and it is restored afterwards. The pattern is
 * built from a string because a NUL in a regex literal trips `no-control-regex`.
 */
const RAW_MARKER = '\u0000'
const RAW_PLACEHOLDER = new RegExp(`${RAW_MARKER}(\\d+)${RAW_MARKER}`, 'g')

function maskRaw(raw: string[], text: string): string {
  raw.push(text)
  return `${RAW_MARKER}${raw.length - 1}${RAW_MARKER}`
}

/** Concatenate an element's text, mapping `<br>` to `\n` and skipping SKIP_TAGS. */
function collectRawText(node: Node): string {
  if (node.nodeType === 3) return node.nodeValue ?? ''
  if (node.nodeType !== 1) return ''
  const el = node as Element
  const tag = el.tagName.toLowerCase()
  if (SKIP_TAGS.has(tag)) return ''
  if (tag === 'br') return '\n'
  return Array.from(el.childNodes).map((child) => collectRawText(child)).join('')
}

function collectPlainText(node: Node, out: string[], raw: string[]): void {
  if (node.nodeType === 3) {
    const text = node.nodeValue ?? ''
    // Source-formatting whitespace between block elements (e.g. the newline +
    // indent between two `<p>` tags) is layout, not content: drop it so it does
    // not open a spurious blank line.
    if (text.trim() === '' && text.includes('\n')) return
    // Trim leading spaces of the first content line.
    out.push(out.length === 0 ? text.replace(/^[ \t]+/, '') : text)
    return
  }
  if (node.nodeType !== 1) return
  const el = node as Element
  const tag = el.tagName.toLowerCase()
  if (SKIP_TAGS.has(tag)) return
  if (tag === 'br') {
    out.push('\n')
    return
  }
  if (tag === 'pre') {
    ensureSeparator(out, '\n')
    out.push(maskRaw(raw, collectRawText(el).replace(/\r\n?/g, '\n')))
    return
  }

  const isBlock = BLOCK_TAGS.has(tag)
  if (isBlock && out.length) out.push('\n')
  else if (LINE_TAGS.has(tag)) ensureSeparator(out, '\n')
  else if (CELL_TAGS.has(tag)) ensureSeparator(out, '\t')

  for (const child of Array.from(el.childNodes)) collectPlainText(child, out, raw)

  if (isBlock && !HEADING_TAGS.has(tag)) out.push('\n')
}

/**
 * Derive plain text from document-derived HTML.
 *
 * Uses an inert DOMParser document instead of assigning `innerHTML` to a
 * detached live `<div>`. The parsed document has no browsing context, so
 * resources/handlers (e.g. `<img onerror>`) neither load nor execute, and the
 * source HTML is never inserted into the live document.
 */
export function plainTextFromHtml(html: string): string {
  if (!html || typeof html !== 'string') return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const out: string[] = []
  const raw: string[] = []
  collectPlainText(doc.body, out, raw)
  const normalized = out
    .join('')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .replace(/[ \t]+$/, '')
    .replace(/\n+$/, '')
  return normalized.replace(RAW_PLACEHOLDER, (_, index: string) => raw[Number(index)] ?? '')
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
