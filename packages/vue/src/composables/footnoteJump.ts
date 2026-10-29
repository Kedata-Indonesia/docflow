/**
 * Click on a footnote `<sup>` ref → scroll to the matching note and put the
 * caret at the end of its body. The ref carries the row id in
 * `data-footnote-item-id`, written by the render pass in `useFootnotes`.
 */
export function jumpToFootnoteItem(target: HTMLElement): void {
  const id = target.dataset.footnoteItemId
  if (!id) return

  const itemRow = document.getElementById(id)
  const textEl = itemRow?.querySelector<HTMLElement>('.docs-footnote-item-text')
  if (!textEl) return

  textEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  textEl.focus()
  // Place cursor at end
  const range = document.createRange()
  range.selectNodeContents(textEl)
  range.collapse(false)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}
