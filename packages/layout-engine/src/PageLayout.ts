import { PageBreaker } from './PageBreaker'
import type { BlockInfo, LayoutOptions, LayoutResult, Page } from './types'

export interface EditorLike {
  dom: HTMLElement
  view?: {
    posAtDOM: (node: Node, offset: number) => number
  }
}

export class PageLayout {
  private readonly element: HTMLElement
  private readonly editorView: EditorLike['view'] | undefined
  private readonly options: Required<LayoutOptions>
  private readonly breaker: PageBreaker
  private readonly debounceMs: number
  private shadowRoot: HTMLElement | null = null
  private resizeObserver: ResizeObserver | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private lastDocHash = ''
  private lastBlockHashes = new Map<number, string>()
  private lastShadowHash = ''
  private lastSize = { width: 0, height: 0 }
  private lastResult: LayoutResult | null = null
  private pendingResolvers: Array<(result: LayoutResult) => void> = []

  constructor(
    editor: EditorLike | HTMLElement,
    options: LayoutOptions,
    debounceMs = 150,
  ) {
    if (editor instanceof HTMLElement) {
      this.element = editor
    } else {
      this.element = editor.dom
      this.editorView = editor.view
    }
    this.options = {
      pageHeight: options.pageHeight,
      pageWidth: options.pageWidth ?? 0,
      margins: options.margins ?? { top: 0, bottom: 0, left: 0, right: 0 },
      maxCharsPerPage: options.maxCharsPerPage ?? 0,
    }
    this.debounceMs = debounceMs
    this.breaker = new PageBreaker((block, offset) =>
      this.measureTextOffset(block, offset),
    )
  }

  measureBlocks(root?: HTMLElement): BlockInfo[] {
    const container = root ?? this.element
    const containerRect = container.getBoundingClientRect()
    const blocks: BlockInfo[] = []
    let fallbackPos = 0

    for (const child of Array.from(container.children)) {
      if (!(child instanceof HTMLElement)) continue

      const nodeType =
        child.getAttribute('data-node-type') ?? child.tagName.toLowerCase()
      let pmFrom = parseInt(child.getAttribute('data-from') ?? '-1', 10)
      let pmTo = parseInt(child.getAttribute('data-to') ?? '-1', 10)

      if ((pmFrom < 0 || pmTo < pmFrom) && this.editorView) {
        try {
          pmFrom = this.editorView.posAtDOM(child, 0)
          pmTo = this.editorView.posAtDOM(child, child.childNodes.length)
        } catch (e) {
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
      const canSplit = this.isTextBlock(nodeType)
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
        forceBreak,
        marginTop,
        marginBottom,
      })
    }

    return blocks
  }

  layout(immediate = false): Promise<LayoutResult> {
    return new Promise((resolve) => {
      this.pendingResolvers.push(resolve)
      if (immediate || this.debounceMs <= 0) {
        this.runLayout()
      } else {
        this.scheduleLayout()
      }
    })
  }

  observe(container: HTMLElement): void {
    this.resizeObserver?.disconnect()
    this.resizeObserver = new ResizeObserver(() => {
      this.layout()
    })
    this.resizeObserver.observe(container)
  }

  destroy(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    this.pendingResolvers = []
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    if (this.shadowRoot?.parentNode) {
      this.shadowRoot.parentNode.removeChild(this.shadowRoot)
    }
    this.shadowRoot = null
    this.lastResult = null
    this.lastDocHash = ''
    this.lastBlockHashes = new Map()
    this.lastShadowHash = ''
  }

  private scheduleLayout(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this.runLayout()
    }, this.debounceMs)
  }

  private runLayout(): LayoutResult {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }

    const size = this.getContainerSize()
    const containerChanged = this.lastSize.width !== size.width || this.lastSize.height !== size.height

    // Fast path: nothing changed.
    const docHash = this.computeDocHash()
    if (this.lastResult && !containerChanged && this.lastDocHash === docHash) {
      this.resolveAll(this.lastResult)
      return this.lastResult
    }

    this.prepareShadowLayout()
    const blocks = this.measureBlocks(this.element)
    const availableHeight = this.availableHeight()
    const newBlockHashes = this.computeBlockHashes()

    // Always run full page computation (fast — integer arithmetic),
    // but track which pages changed for potential incremental merging.
    const allPages = this.breaker.computePages(blocks, availableHeight, this.options.maxCharsPerPage)

    // Incremental merge: if only tail pages changed, reuse head pages
    // from the previous result to minimize downstream DOM churn.
    let pages: Page[]
    if (this.lastResult && !containerChanged && this.lastBlockHashes.size > 0) {
      let firstChangedBlockIdx = -1
      for (let i = 0; i < blocks.length; i++) {
        if (newBlockHashes.get(i) !== this.lastBlockHashes.get(i)) {
          firstChangedBlockIdx = i
          break
        }
      }
      if (firstChangedBlockIdx === -1 && newBlockHashes.size !== this.lastBlockHashes.size) {
        firstChangedBlockIdx = Math.min(newBlockHashes.size, this.lastBlockHashes.size)
      }

      if (firstChangedBlockIdx >= 0) {
        const firstChangedFrom = blocks[firstChangedBlockIdx]?.from ?? 0
        const oldPages = this.lastResult.pages
        let affectedPageIdx = oldPages.length

        for (let p = 0; p < oldPages.length; p++) {
          const lastBlock = oldPages[p].blocks[oldPages[p].blocks.length - 1]
          if (lastBlock && lastBlock.to >= firstChangedFrom) {
            affectedPageIdx = p
            break
          }
        }

        // Try to reuse head pages if their boundaries match.
        if (affectedPageIdx > 0 && affectedPageIdx < allPages.length &&
            oldPages[affectedPageIdx - 1]?.to === allPages[affectedPageIdx - 1]?.to) {
          pages = [...oldPages.slice(0, affectedPageIdx), ...allPages.slice(affectedPageIdx)]
        } else {
          pages = allPages
        }
      } else {
        pages = allPages
      }
    } else {
      pages = allPages
    }

    const result: LayoutResult = { pages, invalidatedAt: Date.now() }
    this.lastResult = result
    this.lastDocHash = docHash
    this.lastBlockHashes = newBlockHashes
    this.lastSize = size
    this.resolveAll(result)
    return result
  }

  private resolveAll(result: LayoutResult): void {
    for (const resolve of this.pendingResolvers) {
      resolve(result)
    }
    this.pendingResolvers = []
  }

  private computeDocHash(): string {
    let hash = ''
    for (const child of Array.from(this.element.children)) {
      if (child instanceof HTMLElement) {
        hash +=
          child.tagName +
          (child.getAttribute('data-from') ?? '') +
          (child.getAttribute('data-to') ?? '') +
          (child.getAttribute('data-node-type') ?? '') +
          (child.textContent ?? '')
      }
    }
    return hash
  }

  /** Compute per-block hashes for incremental recalculation. */
  private computeBlockHashes(): Map<number, string> {
    const map = new Map<number, string>()
    let idx = 0
    for (const child of Array.from(this.element.children)) {
      if (child instanceof HTMLElement) {
        map.set(idx, child.tagName +
          (child.getAttribute('data-from') ?? '') +
          (child.getAttribute('data-to') ?? '') +
          (child.getAttribute('data-node-type') ?? '') +
          (child.textContent ?? ''))
      }
      idx++
    }
    return map
  }

  private getContainerSize(): { width: number; height: number } {
    const rect = this.element.getBoundingClientRect()
    return { width: rect.width, height: rect.height }
  }

  private availableHeight(): number {
    const { top, bottom } = this.options.margins
    return this.options.pageHeight - top - bottom
  }

  private prepareShadowLayout(): void {
    if (!this.shadowRoot) {
      const shadow = document.createElement('div')
      shadow.setAttribute('data-layout-shadow', 'true')
      shadow.style.position = 'absolute'
      shadow.style.top = '-9999px'
      shadow.style.left = '-9999px'
      shadow.style.visibility = 'hidden'
      shadow.style.pointerEvents = 'none'
      shadow.style.overflow = 'hidden'
      if (this.options.pageWidth > 0) {
        shadow.style.width = `${this.options.pageWidth}px`
      }
      shadow.className = this.element.className || 'tiptap ProseMirror'
      document.body.appendChild(shadow)
      this.shadowRoot = shadow
    }
    const currentHash = this.computeDocHash()
    if (this.lastShadowHash !== currentHash) {
      this.shadowRoot.innerHTML = ''
      for (const child of Array.from(this.element.children)) {
        this.shadowRoot.appendChild(child.cloneNode(true))
      }
      // Clean up margin-top styles from all cloned elements so measurements are clean
      const elements = Array.from(this.shadowRoot.getElementsByTagName('*')) as HTMLElement[]
      elements.forEach((el) => {
        el.style.removeProperty('margin-top')
      })
      this.lastShadowHash = currentHash
    }
  }

  private isTextBlock(nodeType: string): boolean {
    return ['paragraph', 'heading', 'list', 'blockquote', 'codeBlock'].includes(
      nodeType,
    )
  }

  private measureTextOffset(block: BlockInfo, offset: number): number | null {
    if (offset <= 0) return 0
    const root = this.shadowRoot ?? this.element
    const el = root.querySelector(`[data-from="${block.from}"]`)
    if (!el) return null

    const start = this.findTextNodeAtOffset(el, 0)
    const end = this.findTextNodeAtOffset(el, offset)
    if (!start || !end) return null

    const range = document.createRange()
    range.setStart(start.node, start.offset)
    range.setEnd(end.node, end.offset)
    const rects = range.getClientRects()
    if (!rects.length) return null

    return rects[rects.length - 1].bottom - rects[0].top
  }

  private findTextNodeAtOffset(
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
}
