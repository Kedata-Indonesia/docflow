import { sanitizeInlineHTML } from '@kedata-indonesia/docflow-core'

/**
 * Ports the footnote item builder needs from the composable: citation
 * rendering comes from the editor's citation engine, and free-text edits are
 * persisted back to the ProseMirror node.
 */
export interface FootnoteItemDeps {
  renderCitation: (citationId: string) => string
  saveContent: (ref: HTMLElement, content: string) => void
}

/**
 * Build one footnote row body. Free-text footnotes stay editable and sync
 * back to the PM node on blur (existing behavior). Citation-backed footnotes
 * (Phase 6, `data-footnote-source-id`) are citeproc-rendered and read-only —
 * their text is derived, never typed.
 */
export function buildFootnoteTextDiv(ref: HTMLElement, deps: FootnoteItemDeps): HTMLDivElement {
  const textDiv = document.createElement('div')
  textDiv.className = 'docs-footnote-item-text'

  if (ref.hasAttribute('data-footnote-source-id')) {
    const citationId = ref.getAttribute('data-citation-id') ?? ''
    const html = deps.renderCitation(citationId)
    textDiv.classList.add('docs-footnote-item-text--citation')
    if (html) {
      textDiv.innerHTML = html
    } else {
      // Fall back to persisted content when the engine hasn't synced yet
      // (e.g. immediately after document load).
      // `data-footnote-content` is a document node attribute, so in a
      // collab session / imported document it is attacker-controlled:
      // sanitize before innerHTML (issue #71). The engine branch above is
      // citeproc output, covered by the engine escaping invariant (#72).
      const persisted = ref.getAttribute('data-footnote-content') ?? ''
      if (persisted) {
        textDiv.innerHTML = sanitizeInlineHTML(persisted)
      } else {
        textDiv.setAttribute('data-empty', 'true')
      }
    }
    return textDiv
  }

  const content = ref.getAttribute('data-footnote-content') ?? ''
  textDiv.contentEditable = 'true'
  textDiv.textContent = content
  if (!content) textDiv.setAttribute('data-empty', 'true')

  textDiv.addEventListener('input', () => {
    textDiv.removeAttribute('data-empty')
    if (!textDiv.textContent) textDiv.setAttribute('data-empty', 'true')
  })

  textDiv.addEventListener('blur', () => {
    const newContent = textDiv.textContent?.trim() ?? ''
    deps.saveContent(ref, newContent)
  })
  return textDiv
}
