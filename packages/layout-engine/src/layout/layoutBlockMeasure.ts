import type { BlockInfo } from '../types'

/** Node types whose text the breaker is allowed to split across pages. */
const TEXT_BLOCK_TYPES = ['paragraph', 'heading', 'list', 'blockquote', 'codeBlock']

export interface BlockMeasureOptions {
  container: HTMLElement
  /** ProseMirror view, when the DOM came from a live editor. */
  editorView?: {
    posAtDOM: (node: Node, offset: number) => number
  }
  /** Node types that must not be cut when they fit on one page. */
  keepTogetherTypes: readonly string[]
}

function isTextBlock(nodeType: string): boolean {
  return TEXT_BLOCK_TYPES.includes(nodeType)
}

/**
 * Turn the editor's top-level DOM children into the block list the breaker
 * reasons about.
 *
 * Positions come from `data-from`/`data-to` when the renderer emitted them,
 * then from `posAtDOM`, then from a sequential text-length fallback — the
 * layout must still produce pages for DOM that was never part of a document
 * (print preview, exported HTML).
 */
export function measureBlocks(options: BlockMeasureOptions): BlockInfo[] {
  const { container, editorView, keepTogetherTypes } = options
  const containerRect = container.getBoundingClientRect()
  const blocks: BlockInfo[] = []
  let fallbackPos = 0

  for (const child of Array.from(container.children)) {
    if (!(child instanceof HTMLElement)) continue

    const nodeType = child.getAttribute('data-node-type') ?? child.tagName.toLowerCase()
    let pmFrom = parseInt(child.getAttribute('data-from') ?? '-1', 10)
    let pmTo = parseInt(child.getAttribute('data-to') ?? '-1', 10)

    if ((pmFrom < 0 || pmTo < pmFrom) && editorView) {
      try {
        pmFrom = editorView.posAtDOM(child, 0)
        pmTo = editorView.posAtDOM(child, child.childNodes.length)
      } catch {
        // fallback below
      }
    }

    if (pmFrom < 0 || pmTo < pmFrom) {
      // Fallback: assign sequential positions based on text content
      pmFrom = fallbackPos
      const textLen = child.textContent?.length ?? 0
      pmTo = fallbackPos + textLen + 2 // +2 for node wrapping
      fallbackPos = pmTo
    }

    const rect = child.getBoundingClientRect()
    const canSplit = isTextBlock(nodeType)
    // Measured here, honoured by PageBreaker: quote and code blocks are still
    // splittable (they can exceed a page) but must not be cut when they fit.
    const keepTogether = keepTogetherTypes.includes(nodeType)
    const forceBreak =
      child.getAttribute('data-page-break') === 'true' ||
      nodeType === 'pageBreak'

    // Capture CSS margins so the PageBreaker can account for inter-block spacing.
    // These margins are NOT included in getBoundingClientRect() but DO take up
    // vertical space on the page. Without this, the breaker would underestimate
    // used height, causing text overflow at page boundaries.
    const style = getComputedStyle(child)
    const marginTop = parseFloat(style.marginTop) || 0
    const marginBottom = parseFloat(style.marginBottom) || 0

    blocks.push({
      nodeType,
      from: pmFrom,
      to: pmTo,
      top: rect.top - containerRect.top,
      bottom: rect.bottom - containerRect.top,
      rect,
      canSplit,
      keepTogether,
      forceBreak,
      marginTop,
      marginBottom,
    })
  }

  return blocks
}
