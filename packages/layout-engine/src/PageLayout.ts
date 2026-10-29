import { PageBreaker } from './PageBreaker'
import {
  DEFAULT_KEEP_TOGETHER_TYPES,
  type BlockInfo,
  type LayoutOptions,
  type LayoutResult,
} from './types'
import { measureBlocks } from './layout/layoutBlockMeasure'
import { computeBlockHashes, computeDocHash } from './layout/layoutFingerprint'
import { mergeIncrementalPages } from './layout/incrementalPages'
import { ShadowLayout } from './layout/layoutShadow'
import { measureTextOffset } from './layout/layoutTextOffset'

export interface EditorLike {
  dom: HTMLElement
  view?: {
    posAtDOM: (node: Node, offset: number) => number
  }
}

/**
 * Paginates the editor's top-level blocks.
 *
 * A run is: measure the DOM (`layout/layoutBlockMeasure`), ask the breaker for
 * pages, then reuse unchanged head pages (`layout/incrementalPages`) so only
 * the tail redraws. Results are memoised on a document fingerprint
 * (`layout/layoutFingerprint`) plus the container size, and text splits are
 * measured in an off-screen clone (`layout/layoutShadow` +
 * `layout/layoutTextOffset`).
 */
export class PageLayout {
  private readonly element: HTMLElement
  private readonly editorView: EditorLike['view'] | undefined
  private readonly options: Required<LayoutOptions>
  private readonly breaker: PageBreaker
  private readonly debounceMs: number
  private readonly shadow: ShadowLayout
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private lastDocHash = ''
  private lastBlockHashes = new Map<number, string>()
  private shadowHash = ''
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
      keepTogetherTypes: options.keepTogetherTypes ?? DEFAULT_KEEP_TOGETHER_TYPES,
    }
    this.debounceMs = debounceMs
    this.shadow = new ShadowLayout(this.element, this.options.pageWidth)
    // The off-screen clone is built lazily: a pass that never splits a block
    // must not clone the document DOM (issue #375 follow-up).
    this.breaker = new PageBreaker((block, offset) => {
      this.shadow.prepare(this.shadowHash)
      return measureTextOffset(this.shadow.container, block.from, offset)
    })
  }

  measureBlocks(root?: HTMLElement): BlockInfo[] {
    return measureBlocks({
      container: root ?? this.element,
      editorView: this.editorView,
      keepTogetherTypes: this.options.keepTogetherTypes,
    })
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

  destroy(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    this.pendingResolvers = []
    this.shadow.dispose()
    this.lastResult = null
    this.lastDocHash = ''
    this.lastBlockHashes = new Map()
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
    const containerChanged =
      this.lastSize.width !== size.width || this.lastSize.height !== size.height

    // Fast path: nothing changed.
    const docHash = computeDocHash(this.element)
    if (this.lastResult && !containerChanged && this.lastDocHash === docHash) {
      this.resolveAll(this.lastResult)
      return this.lastResult
    }

    this.shadowHash = docHash
    const blocks = this.measureBlocks()
    const availableHeight = this.availableHeight()
    const blockHashes = computeBlockHashes(this.element)

    // Always run full page computation (fast — integer arithmetic),
    // but track which pages changed for potential incremental merging.
    const allPages = this.breaker.computePages(blocks, availableHeight)

    const pages = mergeIncrementalPages({
      allPages,
      previous: this.lastResult,
      containerChanged,
      previousBlockHashes: this.lastBlockHashes,
      blockHashes,
      blocks,
    })

    const result: LayoutResult = { pages, invalidatedAt: Date.now() }
    this.lastResult = result
    this.lastDocHash = docHash
    this.lastBlockHashes = blockHashes
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

  private getContainerSize(): { width: number; height: number } {
    const rect = this.element.getBoundingClientRect()
    return { width: rect.width, height: rect.height }
  }

  private availableHeight(): number {
    const { top, bottom } = this.options.margins
    return this.options.pageHeight - top - bottom
  }
}
