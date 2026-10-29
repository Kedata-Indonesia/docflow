/**
 * Height of the first `offset` characters of a block, measured with a real
 * Range inside `root` (the off-screen clone, so the live editor is untouched).
 *
 * Used by `PageBreaker` to decide where a splittable block ends on a page.
 * Returns `null` when the block cannot be located or has no text nodes — the
 * breaker then falls back to keeping the block whole.
 */
export function measureTextOffset(
  root: Element,
  blockFrom: number,
  offset: number,
): number | null {
  if (offset <= 0) return 0
  const el = root.querySelector(`[data-from="${blockFrom}"]`)
  if (!el) return null

  const start = findTextNodeAtOffset(el, 0)
  const end = findTextNodeAtOffset(el, offset)
  if (!start || !end) return null

  const range = document.createRange()
  range.setStart(start.node, start.offset)
  range.setEnd(end.node, end.offset)
  const rects = range.getClientRects()
  if (!rects.length) return null

  return rects[rects.length - 1].bottom - rects[0].top
}

function findTextNodeAtOffset(
  root: Element,
  offset: number,
): { node: Text; offset: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let remaining = offset
  let node: Text | null = walker.nextNode() as Text | null

  while (node) {
    const length = node.textContent?.length ?? 0
    if (remaining <= length) {
      return { node, offset: remaining }
    }
    remaining -= length
    node = walker.nextNode() as Text | null
  }

  return null
}
