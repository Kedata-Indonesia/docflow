/**
 * Selection/cursor location context (issue #219).
 *
 * Computes *where* in the document the user is pointing so the host can pass
 * it along to the AI prompt: page (DOM pagination), paragraph/block index,
 * line within the block, block type, and the nearest preceding heading
 * (BAB/section context).
 *
 * Lives in the `vue` package (not core/plugins) because the page number is
 * derived from the pagination DOM (`[data-rm-pagination]` / `.rm-page-break`
 * produced by `tiptap-pagination-plus`), which only exists in the rendering
 * layer.
 *
 * NOTE: callers should pass the RAW editor (unwrap Vue proxies via `toRaw`)
 * — a proxied Editor yields proxied node types that break PM identity checks.
 */
import type { Editor } from '@tiptap/core'
import type { AIContextLocation } from '@kedata-indonesia/docflow-core'

/**
 * Document-order 1-based index of the block containing `blockStart`.
 *
 * PM's `nodesBetween` walks the doc with *content-relative* positions, while
 * `blockStart` is an absolute doc position (doc content starts at 1). We pass
 * `startPos = 1` so the callback receives absolute positions, and `to =
 * blockStart - 1` so the loop stops before the cursor's own block.
 */
function blockIndexInDoc(editor: Editor, blockStart: number): number {
  let index = 1
  editor.state.doc.nodesBetween(
    0,
    blockStart - 1,
    (node, pos) => {
      if (node.isBlock && pos > 0) index++
    },
    1,
  )
  return index
}

/** Nearest preceding heading text (nearest = last heading before `pos`). */
function nearestSection(editor: Editor, pos: number): string | undefined {
  let section: string | undefined
  editor.state.doc.nodesBetween(0, pos, (node) => {
    if (node.type.name === 'heading' && node.textContent.trim()) {
      // nodesBetween visits in document order → the LAST match is the nearest
      // heading before (or containing) the position.
      section = node.textContent.trim()
    }
  })
  return section
}

/**
 * 1-based line number of `head` within its block, measured from vertical
 * offsets via `view.coordsAtPos`. Falls back to 1 when the measurement is
 * unavailable (headless tests, unmeasured positions).
 */
function lineInBlock(editor: Editor, blockStart: number, head: number): number {
  try {
    const { view } = editor
    const headCoords = view.coordsAtPos(head)
    const startCoords = view.coordsAtPos(blockStart)
    if (!headCoords || !startCoords) return 1
    const lineHeight =
      parseFloat(getComputedStyle(view.dom).lineHeight) ||
      parseFloat(getComputedStyle(view.dom).fontSize) * 1.6 ||
      24
    if (lineHeight <= 0) return 1
    return Math.max(1, Math.round((headCoords.top - startCoords.top) / lineHeight) + 1)
  } catch {
    return 1
  }
}

/** Page number + total pages from the pagination DOM (1-based; pageless → 1). */
function pageInfo(editor: Editor): { page: number; pageCount: number } {
  const editorDom = editor.view.dom
  const paginationElement = editorDom.querySelector('[data-rm-pagination]')
  if (!paginationElement) return { page: 1, pageCount: 1 }

  // Headless / hidden editor (happy-dom, jsdom, display:none): all geometry
  // reports 0, so any page number would be meaningless → fall back to 1/1.
  const rect = editorDom.getBoundingClientRect()
  if (rect.height === 0 || rect.width === 0) return { page: 1, pageCount: 1 }

  const pageCount = paginationElement.children.length || 1

  let page = 1
  try {
    const coords = editor.view.coordsAtPos(editor.state.selection.head)
    if (!coords) return { page, pageCount }
    const pageBreaks = Array.from(paginationElement.querySelectorAll('.rm-page-break'))
    const editorRect = editorDom.getBoundingClientRect()
    const selectionTop = coords.top - editorRect.top + editorDom.scrollTop

    let pageIndex = 1
    let found = false
    for (const br of pageBreaks) {
      const breaker = br.querySelector('.breaker')
      if (breaker instanceof HTMLElement) {
        if (selectionTop < breaker.offsetTop) {
          page = pageIndex
          found = true
          break
        }
      }
      pageIndex++
    }
    if (!found) page = pageIndex
  } catch {
    page = 1
  }
  return { page, pageCount }
}

/**
 * Collect the location context of the current selection/cursor.
 * Returns only optional fields — all values are best-effort and safe to miss
 * (headless tests, pageless mode, unusual block structures).
 */
export function collectSelectionContext(editor: Editor): AIContextLocation {
  const state = editor.state
  const { $from, head } = state.selection

  // Block containing the cursor (walk up from the deepest path node until a
  // block node is found — the selection may sit directly on an inline node).
  let depth = $from.depth
  while (depth > 0 && !$from.node(depth).isBlock) {
    depth--
  }
  const blockStart = $from.before(depth)
  const block = $from.node(depth)
  const blockType = block.isBlock ? block.type.name : undefined

  const { page, pageCount } = pageInfo(editor)

  return {
    page,
    pageCount,
    paragraphIndex: blockStart > 0 ? blockIndexInDoc(editor, blockStart) : 1,
    line: lineInBlock(editor, blockStart, head),
    ...(blockType ? { blockType } : {}),
    section: nearestSection(editor, head),
  }
}
