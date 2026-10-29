/** Elements a contenteditable uses to represent a new line (Enter). */
const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'dd', 'div', 'dl', 'dt', 'fieldset',
  'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header',
  'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'tbody', 'td', 'tfoot',
  'th', 'thead', 'tr', 'ul',
])

const INLINE_TAGS = new Set(['b', 'strong', 'i', 'em', 'u'])

/**
 * Convert a contenteditable's block/newline structure into inline HTML with
 * explicit `<br>` separators. Chromium represents Enter as sibling `<div>`s and
 * Shift+Enter as a text newline; `sanitizeInlineHTML` unwraps blocks, so without
 * this a multi-line header/footer collapses onto a single line (issue #319).
 */
export function editableHTMLToInlineHTML(html: string): string {
  if (!html) return ''
  const SENTINEL = '\u0000'
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const parts: string[] = []

  const serialize = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) {
        // Shift+Enter can arrive as a literal newline inside a text node.
        parts.push((child.textContent || '').replace(/\r?\n/g, SENTINEL))
        continue
      }
      if (child.nodeType !== 1) continue

      const el = child as Element
      const tag = el.tagName.toLowerCase()
      if (tag === 'br') {
        parts.push(SENTINEL)
        continue
      }

      const isBlock = BLOCK_TAGS.has(tag)
      // A block starts on a new line unless we are at the very start or the
      // previous token already broke the line.
      if (isBlock && parts.length > 0 && !parts[parts.length - 1].endsWith(SENTINEL)) {
        parts.push(SENTINEL)
      }
      if (INLINE_TAGS.has(tag)) {
        parts.push(`<${tag}>`)
        serialize(el)
        parts.push(`</${tag}>`)
      } else {
        serialize(el)
      }
      // A block ends with a line break (trimmed later at the very end).
      if (isBlock) parts.push(SENTINEL)
    }
  }

  serialize(doc.body)
  const lines = parts.join('').split(SENTINEL)
  while (lines.length > 0 && lines[0] === '') lines.shift()
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines.join('<br>')
}
