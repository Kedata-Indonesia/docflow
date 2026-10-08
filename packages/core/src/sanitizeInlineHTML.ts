/**
 * Inline-HTML allowlist sanitizer for document-derived header/footer templates
 * (issue #51).
 *
 * Header/footer slots are seeded from the loaded document (`modelValue` →
 * `initialDoc.headerLeft/…`, then persisted back), so in a shared collaboration
 * session or an imported document they are attacker-controlled. They are
 * rendered with `v-html` (VirtualPageOverlay) and `innerHTML`
 * (PaginationPlus widgets / the inline header editor), which is a stored-XSS
 * surface, e.g. `<img src=x onerror=alert(document.cookie)>`.
 *
 * Policy (inline-only allowlist):
 * - Keep text and the tags `b`, `strong`, `i`, `em`, `u`, `br`, `sup`, `sub`,
 *   `nobr` (the last three carry citation-backed footnote markup); strip EVERY
 *   attribute from those tags (no `style`, no event handlers).
 * - Drop these elements together with their whole subtree: script, style,
 *   template, noscript, iframe, frame, frameset, object, embed, applet, svg,
 *   math, link, meta, base, title, form, input, textarea, select, button,
 *   canvas, audio, video, source, track.
 * - Any other element is unwrapped, keeping its text/children.
 * - HTML comments are removed.
 * - `{page}`/`{total}` page-number tokens are plain text and survive intact.
 *
 * The transform is DOM-based (mirroring `normalizeClipboardHTML`), idempotent,
 * never throws, and treats nullish/empty input as `''`. Plain text without a
 * `<` takes a fast path so page-number tokens stay byte-identical.
 */
const ALLOWED_TAGS = new Set(['b', 'strong', 'i', 'em', 'u', 'br', 'sup', 'sub', 'nobr'])

const DROP_TAGS = new Set([
  'script', 'style', 'template', 'noscript', 'iframe', 'frame', 'frameset',
  'object', 'embed', 'applet', 'svg', 'math', 'link', 'meta', 'base', 'title',
  'form', 'input', 'textarea', 'select', 'button', 'canvas', 'audio', 'video',
  'source', 'track',
])

/** Replace an element with its children (keep text, drop the wrapper). */
function unwrap(el: Element): void {
  const parent = el.parentNode
  if (!parent) return
  while (el.firstChild) parent.insertBefore(el.firstChild, el)
  parent.removeChild(el)
}

function stripAttributes(el: Element): void {
  for (const attr of Array.from(el.attributes)) el.removeAttribute(attr.name)
}

function removeComments(root: Node): void {
  const doc = root.ownerDocument
  if (!doc) return
  const walker = doc.createTreeWalker(root, 128 /* NodeFilter.SHOW_COMMENT */)
  const comments: Node[] = []
  let node = walker.nextNode()
  while (node) {
    comments.push(node)
    node = walker.nextNode()
  }
  for (const comment of comments) comment.parentNode?.removeChild(comment)
}

export function sanitizeInlineHTML(html: string): string {
  if (!html || typeof html !== 'string') return ''
  // Fast path: plain text (and `{page}`/`{total}` tokens) passes through
  // byte-identical, and avoids a DOMParser round-trip.
  if (!html.includes('<')) return html

  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    removeComments(doc.body)

    // Remove dangerous/non-content elements with their subtrees.
    for (const tag of DROP_TAGS) {
      for (const el of Array.from(doc.body.getElementsByTagName(tag))) {
        el.parentNode?.removeChild(el)
      }
    }

    // Post-order walk so children are normalized before a parent unwraps.
    const walk = (node: Node): void => {
      if (node.nodeType !== 1) return
      for (const child of Array.from(node.childNodes)) walk(child)
      const el = node as Element
      if (ALLOWED_TAGS.has(el.tagName.toLowerCase())) stripAttributes(el)
      else unwrap(el)
    }
    for (const child of Array.from(doc.body.childNodes)) walk(child)

    return doc.body.innerHTML
  } catch {
    // Never throw on hostile input: fall back to plain text.
    return ''
  }
}
