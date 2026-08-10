/**
 * DOM-based clipboard HTML normalization (Stage 2 of the paste pipeline —
 * docs/plans/clipboard-paste-pipeline-plan.md).
 *
 * Replaces the old regex-based sanitizePastedHTML: pasted HTML from Google
 * Docs, Word, Notion, or generic web pages is parsed into an inert Document,
 * normalized against a whitelist, and serialized for ProseMirror's parser.
 *
 * Design decisions (see plan §3):
 * - Typography normalizes to destination styles: font-family, font-size,
 *   line-height, margins and padding are stripped; only `color` and
 *   `background-color` survive as inline styles.
 * - One pipeline for all HTML sources; detectClipboardSource only tunes
 *   which wrapper-stripping rules run.
 * - Idempotent by construction: normalizing twice changes nothing.
 */

export type ClipboardSource = 'google-docs' | 'word' | 'generic'

/** Inline style properties that survive normalization. */
const KEEP_STYLE_PROPS = new Set(['color', 'background-color'])

/** Elements removed with all their children (non-content or dangerous). */
const REMOVE_TAGS = new Set([
  'meta', 'style', 'link', 'base', 'title', 'script', 'iframe', 'object',
  'embed', 'form', 'input', 'button', 'select', 'textarea', 'noscript',
  // Word Office namespace dump paragraph
  'o:p',
])

/** Attributes that survive, per tag (everything else is stripped). */
const KEEP_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'style']),
  img: new Set(['src', 'alt', 'style']),
  td: new Set(['colspan', 'rowspan', 'style']),
  th: new Set(['colspan', 'rowspan', 'style']),
  col: new Set(['span']),
  '*': new Set(['style']),
}

export function detectClipboardSource(html: string): ClipboardSource {
  if (/id\s*=\s*["']docs-internal/i.test(html)) return 'google-docs'
  if (/<o:p[\s>]|xmlns(:w|:o)?=|class\s*=\s*["']?Mso|mso-/i.test(html)) return 'word'
  return 'generic'
}

function parseStyleDeclarations(style: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const decl of style.split(';')) {
    const idx = decl.indexOf(':')
    if (idx < 0) continue
    const prop = decl.slice(0, idx).trim().toLowerCase()
    const val = decl.slice(idx + 1).trim()
    if (prop && val) map.set(prop, val)
  }
  return map
}

/** Reduce a style attribute to the whitelisted properties; drop if empty. */
function cleanStyleAttr(el: Element): void {
  const style = el.getAttribute('style')
  if (!style) return
  const kept: string[] = []
  parseStyleDeclarations(style).forEach((val, prop) => {
    if (KEEP_STYLE_PROPS.has(prop)) kept.push(`${prop}: ${val}`)
  })
  if (kept.length) el.setAttribute('style', kept.join('; '))
  else el.removeAttribute('style')
}

function cleanAttrs(el: Element): void {
  const keep = new Set([...(KEEP_ATTRS['*'] ?? []), ...(KEEP_ATTRS[el.tagName.toLowerCase()] ?? [])])
  for (const attr of Array.from(el.attributes)) {
    if (!keep.has(attr.name)) el.removeAttribute(attr.name)
  }
}

/** Replace an element with its children. */
function unwrap(el: Element): void {
  const parent = el.parentNode
  if (!parent) return
  while (el.firstChild) parent.insertBefore(el.firstChild, el)
  parent.removeChild(el)
}

/**
 * Convert a <span> carrying a background(-color) into a <mark>, preserving
 * text color as an inner span so the Highlight and TextStyle marks both
 * parse. (Same output contract as the old regex sanitizer.)
 */
function convertHighlightSpan(span: Element, styles: Map<string, string>): void {
  const bg = styles.get('background-color') ?? styles.get('background')
  if (!bg) return
  const color = styles.get('color')
  const mark = span.ownerDocument.createElement('mark')
  mark.setAttribute('style', `background-color: ${bg}`)
  if (color) {
    const inner = span.ownerDocument.createElement('span')
    inner.setAttribute('style', `color: ${color}`)
    while (span.firstChild) inner.appendChild(span.firstChild)
    mark.appendChild(inner)
  } else {
    while (span.firstChild) mark.appendChild(span.firstChild)
  }
  span.replaceWith(mark)
}

function normalizeElement(el: Element, source: ClipboardSource): void {
  // Highlight conversion needs the original styles before cleaning.
  if (el.tagName === 'SPAN') {
    const styles = parseStyleDeclarations(el.getAttribute('style') ?? '')
    if (styles.has('background-color') || styles.has('background')) {
      convertHighlightSpan(el, styles)
      return
    }
    cleanStyleAttr(el)
    cleanAttrs(el)
    // Span carrying nothing meaningful → unwrap, keep the text.
    if (el.attributes.length === 0) unwrap(el)
    return
  }

  // Google Docs wraps content in <b style="font-weight:normal"> — a generic
  // wrapper, not bold. Unwrap it; leave real <b>/<strong> untouched.
  if (el.tagName === 'B') {
    const styles = parseStyleDeclarations(el.getAttribute('style') ?? '')
    if (styles.get('font-weight')?.replace(/\s/g, '') === 'normal') {
      unwrap(el)
      return
    }
  }

  cleanStyleAttr(el)
  cleanAttrs(el)

  if (source === 'word') {
    // Word list paragraphs rely on mso-list indentation we drop entirely.
    el.removeAttribute('class')
  }
}

function removeComments(root: Node): void {
  const walker = root.ownerDocument!.createTreeWalker(root, 128 /* NodeFilter.SHOW_COMMENT */)
  const comments: Node[] = []
  let node = walker.nextNode()
  while (node) {
    comments.push(node)
    node = walker.nextNode()
  }
  for (const c of comments) c.parentNode?.removeChild(c)
}

export function normalizeClipboardHTML(html: string): string {
  if (!html || typeof html !== 'string') return html ?? ''
  // Plain text (no tags) passes through untouched.
  if (!/[<][a-zA-Z]/.test(html)) return html

  const source = detectClipboardSource(html)
  const doc = new DOMParser().parseFromString(html, 'text/html')

  removeComments(doc.body)

  // Remove non-content elements (deepest-first via live query loop).
  for (const tag of REMOVE_TAGS) {
    for (const el of Array.from(doc.body.getElementsByTagName(tag))) {
      el.parentNode?.removeChild(el)
    }
  }

  // Post-order walk so children normalize before their parent is
  // potentially unwrapped/replaced.
  const walk = (node: Node): void => {
    if (node.nodeType !== 1) return
    for (const child of Array.from(node.childNodes)) walk(child)
    normalizeElement(node as Element, source)
  }
  for (const child of Array.from(doc.body.childNodes)) walk(child)

  return doc.body.innerHTML
}

/**
 * Backward-compatible name kept for existing callers
 * (transformPastedHTML in Editor.ts, handlePaste in DocsEditor.vue).
 */
export const sanitizePastedHTML = normalizeClipboardHTML
