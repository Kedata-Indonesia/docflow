import {
  removeComments,
  removeElementsWithSubtree,
  unwrap,
  walkElementsPostOrder,
} from './domSanitize.js'

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

/**
 * Inline style properties that survive normalization.
 *
 * The font properties are listed for issue #304: copying text between two Docflow
 * documents used to drop `font-family`/`font-size`, so the pasted text silently took
 * the destination's default font. Properties that are not listed are still dropped.
 */
const KEEP_STYLE_PROPS = new Set([
  'color',
  'background-color',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-decoration',
  'line-height',
  'letter-spacing',
])

/**
 * The value is still attacker-controlled HTML, so even a whitelisted property is
 * refused when it could fetch a resource (`url()`, `image-set()`), execute
 * (`expression()`, `javascript:`) or reach a custom property (`var()`).
 */
const UNSAFE_STYLE_VALUE = /url\s*\(|image-set\s*\(|expression\s*\(|javascript:|var\s*\(|@import|</i
/** Plain CSS keyword/number/list values only — no escapes, no comments, no markup. */
const SAFE_STYLE_CHARS = /^[#a-zA-Z0-9\s,.%()'"+/-]+$/

function isSafeStyleValue(value: string): boolean {
  return SAFE_STYLE_CHARS.test(value) && !UNSAFE_STYLE_VALUE.test(value)
}

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
  // `data-indent` carries the block indent (issue #189). Without it, copying an
  // indented paragraph inside the editor and pasting it back would silently
  // lose the level, because normalization runs on every paste.
  '*': new Set(['style', 'data-indent']),
}

/** Attributes whose value is a URL and must pass the scheme allowlist. */
const URL_ATTRS = new Set(['href', 'src'])

/**
 * Schemes allowed in pasted `href`/`src` values (issue #178). Relative URLs
 * resolve against a fixed base and therefore report `http:`/`https:`; only
 * `mailto:` is additionally allowed, and only on links.
 */
const SAFE_URL_SCHEMES = new Set(['http:', 'https:'])

/** Base used purely to resolve URLs while validating their scheme. */
const URL_VALIDATION_BASE = 'https://docflow.invalid/'

/**
 * Defense-in-depth URL check: TipTap validates URIs today, but this seam must
 * not rely on it staying strict. The parsed scheme is inspected on a normalized
 * value, so casing, whitespace and control characters cannot smuggle
 * `javascript:`/`data:`/`vbscript:` past the check.
 */
function isSafeUrlValue(value: string, allowMailto: boolean): boolean {
  if (!value.trim()) return false
  let scheme: string
  try {
    scheme = new URL(value, URL_VALIDATION_BASE).protocol
  } catch {
    return false
  }
  if (SAFE_URL_SCHEMES.has(scheme)) return true
  return allowMailto && scheme === 'mailto:'
}

function cleanUrlAttrs(el: Element): void {
  const allowMailto = el.tagName === 'A'
  for (const attr of Array.from(el.attributes)) {
    if (URL_ATTRS.has(attr.name) && !isSafeUrlValue(attr.value, allowMailto)) {
      el.removeAttribute(attr.name)
    }
  }
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
    if (KEEP_STYLE_PROPS.has(prop) && isSafeStyleValue(val)) kept.push(`${prop}: ${val}`)
  })
  if (kept.length) el.setAttribute('style', kept.join('; '))
  else el.removeAttribute('style')
}

function cleanAttrs(el: Element): void {
  const keep = new Set([...(KEEP_ATTRS['*'] ?? []), ...(KEEP_ATTRS[el.tagName.toLowerCase()] ?? [])])
  for (const attr of Array.from(el.attributes)) {
    if (!keep.has(attr.name)) el.removeAttribute(attr.name)
  }
  cleanUrlAttrs(el)
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

export function normalizeClipboardHTML(html: string): string {
  if (!html || typeof html !== 'string') return html ?? ''
  // Plain text (no tags) passes through untouched.
  if (!/[<][a-zA-Z]/.test(html)) return html

  const source = detectClipboardSource(html)
  const doc = new DOMParser().parseFromString(html, 'text/html')

  removeComments(doc.body)

  // Remove non-content elements with their subtrees.
  removeElementsWithSubtree(doc.body, REMOVE_TAGS)

  // Post-order walk so children normalize before their parent is
  // potentially unwrapped/replaced.
  walkElementsPostOrder(doc.body, (el) => normalizeElement(el, source))

  return doc.body.innerHTML
}

/**
 * Backward-compatible name kept for existing callers
 * (transformPastedHTML in Editor.ts, handlePaste in DocsEditor.vue).
 */
export const sanitizePastedHTML = normalizeClipboardHTML
