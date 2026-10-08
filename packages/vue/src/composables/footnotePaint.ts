/**
 * Paint pageless footnotes at the very bottom of the paper (pagination not
 * computed yet). Numbers the inline refs sequentially.
 */
export function paintPagelessFootnotes(
  paper: HTMLElement,
  refs: HTMLElement[],
  buildItem: (ref: HTMLElement) => HTMLDivElement,
): void {
  refs.forEach((ref, i) => { ref.textContent = String(i + 1) })

  // Skip the rebuild while a footnote text input is focused, then drop the
  // stale container. (Order matters: removing first would make the guard dead
  // and destroy the caret the user is editing.)
  const existing = paper.querySelector<HTMLElement>('.docs-pageless-footnotes')
  if (existing?.querySelector<HTMLElement>('.docs-footnote-item-text:focus')) return

  existing?.remove()

  if (refs.length === 0) return

  const container = document.createElement('div')
  container.className = 'docs-page-footnotes docs-pageless-footnotes'

  const sep = document.createElement('div')
  sep.className = 'docs-footnotes-sep'
  container.appendChild(sep)

  refs.forEach((ref, n) => {
    const row = document.createElement('div')
    row.className = 'docs-footnote-item'

    const num = document.createElement('sup')
    num.className = 'docs-footnote-item-num'
    num.textContent = String(n + 1)

    const textDiv = buildItem(ref)

    ref.dataset.footnoteItemId = `fn-pageless-${n}`
    row.id = `fn-pageless-${n}`

    row.appendChild(num)
    row.appendChild(textDiv)
    container.appendChild(row)
  })

  paper.appendChild(container)
}

/**
 * Paint inline footnote areas on each page. Footnotes are numbered
 * CONTINUOUSLY through the document (Word / Google Docs behavior): page N
 * continues from the last number on page N-1. This also matches the citation
 * engine's sequential noteIndex. Skips rebuilding any page whose footnote area
 * is currently focused.
 */
export function paintPagedFootnotes(
  pageBreaks: HTMLElement[],
  refs: HTMLElement[],
  buildItem: (ref: HTMLElement) => HTMLDivElement,
): void {
  // Map page index → footnote refs on that page
  const pageRefs = new Map<number, HTMLElement[]>()
  pageBreaks.forEach((_, i) => pageRefs.set(i, []))

  refs.forEach(ref => {
    const top = ref.getBoundingClientRect().top
    let assigned = pageBreaks.length - 1
    for (let i = 0; i < pageBreaks.length - 1; i++) {
      const breaker = pageBreaks[i].querySelector<HTMLElement>('.breaker')
      if (breaker && top < breaker.getBoundingClientRect().top) { assigned = i; break }
    }
    pageRefs.get(assigned)!.push(ref)
  })

  // Footnotes are numbered continuously through the document — the first
  // footnote on a page continues from the last number of the previous page.
  let nextFootnoteNumber = 1
  pageBreaks.forEach((pb, pageIdx) => {
    const refsOnPage = pageRefs.get(pageIdx) ?? []
    const pageStartNumber = nextFootnoteNumber
    nextFootnoteNumber += refsOnPage.length

    // Number inline refs (continuous across pages)
    refsOnPage.forEach((ref, n) => { ref.textContent = String(pageStartNumber + n) })

    // Skip rebuild if a footnote item on this page has focus
    const existing = pb.querySelector<HTMLElement>('.docs-page-footnotes')
    if (existing?.querySelector<HTMLElement>('.docs-footnote-item-text:focus')) return

    existing?.remove()
    if (refsOnPage.length === 0) return

    // Build inline footnote area
    const container = document.createElement('div')
    container.className = 'docs-page-footnotes'

    // Separator line
    const sep = document.createElement('div')
    sep.className = 'docs-footnotes-sep'
    container.appendChild(sep)

    refsOnPage.forEach((ref, n) => {
      const row = document.createElement('div')
      row.className = 'docs-footnote-item'

      const num = document.createElement('sup')
      num.className = 'docs-footnote-item-num'
      num.textContent = String(pageStartNumber + n)

      const textDiv = buildItem(ref)

      // Clicking the sup ref in the text jumps here
      ref.dataset.footnoteItemId = `fn-${pageIdx}-${n}`
      row.id = `fn-${pageIdx}-${n}`

      row.appendChild(num)
      row.appendChild(textDiv)
      container.appendChild(row)
    })

    // Find the page breaker (the layout divider which contains the footer)
    const breaker = pb.querySelector('.breaker')
    if (breaker) {
      // Prepend so it sits exactly above the footer content inside the breaker
      breaker.insertBefore(container, breaker.firstChild)
    } else {
      pb.appendChild(container)
    }
  })
}
