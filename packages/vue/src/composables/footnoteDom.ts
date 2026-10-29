import { sanitizeInlineHTML, type DocsEditor } from '@kedata-indonesia/docflow-core'

export interface FootnoteTextDivOptions {
  /** Read lazily — the editor (and its citation engine) mounts after setup. */
  getEditor: () => DocsEditor['editor'] | null
  /** Persist an edited free-text body back to its ProseMirror node. */
  saveContent: (ref: HTMLElement, content: string) => void
}

/**
 * Build one footnote row body. Free-text footnotes stay editable and sync back
 * to the PM node on blur. Citation-backed footnotes (`data-footnote-source-id`)
 * are citeproc-rendered and read-only — their text is derived, never typed.
 */
export function createFootnoteTextDiv(
  ref: HTMLElement,
  options: FootnoteTextDivOptions,
): HTMLDivElement {
  const { getEditor, saveContent } = options
  const textDiv = document.createElement('div')
  textDiv.className = 'docs-footnote-item-text'

  if (ref.hasAttribute('data-footnote-source-id')) {
    const citationId = ref.getAttribute('data-citation-id') ?? ''
    const engine = (getEditor()?.storage as unknown as Record<string, unknown> | undefined)
      ?.citationEngine as
      { engine?: { renderCluster: (id: string) => string } | null } | undefined
    const html = engine?.engine?.renderCluster(citationId) ?? ''
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
    saveContent(ref, newContent)
  })
  return textDiv
}

/** The footnote area for one page (or the pageless one), separator included. */
export function createFootnoteContainer(extraClass?: string): HTMLDivElement {
  const container = document.createElement('div')
  container.className = extraClass
    ? `docs-page-footnotes ${extraClass}`
    : 'docs-page-footnotes'

  const sep = document.createElement('div')
  sep.className = 'docs-footnotes-sep'
  container.appendChild(sep)
  return container
}

/** One numbered note: `<sup>` number + body, addressed by `id` for click-to-jump. */
export function createFootnoteRow(
  id: string,
  label: string,
  textDiv: HTMLDivElement,
): HTMLDivElement {
  const row = document.createElement('div')
  row.className = 'docs-footnote-item'
  row.id = id

  const num = document.createElement('sup')
  num.className = 'docs-footnote-item-num'
  num.textContent = label

  row.appendChild(num)
  row.appendChild(textDiv)
  return row
}
