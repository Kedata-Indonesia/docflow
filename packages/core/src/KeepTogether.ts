import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { EditorView } from '@tiptap/pm/view'

/**
 * Keep-together for PaginationPlus (issue #249, second half).
 *
 * The layout-engine/virtual-pages mode already moves quote and code blocks
 * whole to the next page. PaginationPlus draws page frames behind a continuous
 * flow, so a block can still straddle a page gap. This plugin inserts a
 * transient spacer (a decoration widget — never a document node) before a
 * keep-together block when it would cross a page boundary and fits on a page,
 * pushing it to the next page. Blocks taller than a page are left to split
 * (the fallback).
 */

export interface KeepTogetherBlock {
  /** ProseMirror position of the block (its start). */
  pos: number
  /** Top in page-relative layout pixels, with any existing spacers removed. */
  top: number
  /** Height in layout pixels. */
  height: number
}

export interface PageBreakerRect {
  /** Page end (top of the page spacer), page-relative layout pixels. */
  top: number
  /** Start of the next page's content (bottom of the footer/gap/header). */
  bottom: number
}

export interface KeepTogetherSpacer {
  pos: number
  height: number
}

/**
 * Pure planner (unit-testable): walks blocks in document order and returns the
 * spacers needed to push straddling blocks to the next page. `top` must be the
 * block's position *without* spacers, so the plan is stable across reruns.
 */
export function planKeepTogetherSpacers(
  blocks: KeepTogetherBlock[],
  breakers: PageBreakerRect[],
  pageHeight: number,
): KeepTogetherSpacer[] {
  if (!blocks.length || !breakers.length || pageHeight <= 0) return []

  const orderedBreakers = [...breakers].sort((a, b) => a.top - b.top)
  const orderedBlocks = [...blocks].sort((a, b) => a.pos - b.pos)
  const spacers: KeepTogetherSpacer[] = []
  let plannedBefore = 0

  for (const block of orderedBlocks) {
    // No whole-page placement exists for a block taller than a page.
    if (block.height > pageHeight) continue

    const breaker = orderedBreakers.find(
      (b) => b.top > block.top && b.top < block.top + block.height,
    )
    if (!breaker) continue

    // Total space needed before this block to start it at the next page.
    const desiredBefore = breaker.bottom - block.top
    const height = desiredBefore - plannedBefore
    if (height <= 0) continue

    spacers.push({ pos: block.pos, height })
    plannedBefore = desiredBefore
  }

  return spacers
}

interface KeepTogetherState {
  decorations: DecorationSet
  plan: KeepTogetherSpacer[]
}

const keepTogetherKey = new PluginKey<KeepTogetherState>('docflowKeepTogether')

function createSpacer(height: number): HTMLElement {
  const el = document.createElement('div')
  el.className = 'docs-keep-together-spacer'
  el.setAttribute('aria-hidden', 'true')
  el.style.height = `${height}px`
  el.style.pointerEvents = 'none'
  return el
}

function signature(items: KeepTogetherSpacer[]): string {
  return items.map((item) => `${item.pos}:${item.height.toFixed(2)}`).join('|')
}

function measure(view: EditorView, types: Set<string>): void {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return

  const state = keepTogetherKey.getState(view.state)
  const current = state?.plan ?? []
  const clear = () => {
    if (current.length === 0) return
    view.dispatch(
      view.state.tr.setMeta(keepTogetherKey, {
        decorations: DecorationSet.empty,
        plan: [],
      } satisfies KeepTogetherState),
    )
  }

  const pages = view.dom.querySelector<HTMLElement>('#pages')
  if (!pages) { clear(); return }

  const breakers = Array.from(pages.querySelectorAll<HTMLElement>('.rm-page-break > .breaker'))
  if (breakers.length === 0) { clear(); return }

  const pageEls = Array.from(pages.querySelectorAll<HTMLElement>('.rm-page-break > .page'))
  const pageHeights = pageEls
    .map((el) => parseFloat(getComputedStyle(el).marginTop) || 0)
    .filter((height) => height > 0)
  const pageHeight = pageHeights.length > 0 ? Math.min(...pageHeights) : 0
  if (pageHeight <= 0) { clear(); return }

  const zoom = Math.max(
    0.01,
    parseFloat(getComputedStyle(view.dom).getPropertyValue('--docflow-zoom')) || 1,
  )
  const pagesTop = pages.getBoundingClientRect().top
  const breakerRects: PageBreakerRect[] = breakers.map((breaker) => {
    const rect = breaker.getBoundingClientRect()
    return {
      top: (rect.top - pagesTop) / zoom,
      bottom: (rect.bottom - pagesTop) / zoom,
    }
  })

  const currentBefore = (pos: number) =>
    current.filter((spacer) => spacer.pos < pos).reduce((sum, spacer) => sum + spacer.height, 0)

  const blocks: KeepTogetherBlock[] = []
  view.state.doc.descendants((node, pos) => {
    if (!types.has(node.type.name)) return
    const dom = view.nodeDOM(pos)
    if (!(dom instanceof HTMLElement)) return
    const rect = dom.getBoundingClientRect()
    blocks.push({
      pos,
      // Existing spacers already pushed the DOM down; remove them so the
      // planner always sees the un-spaced layout.
      top: (rect.top - pagesTop) / zoom - currentBefore(pos),
      height: rect.height / zoom,
    })
  })

  const plan = planKeepTogetherSpacers(blocks, breakerRects, pageHeight)
  if (signature(plan) === signature(current)) return

  const decorations = DecorationSet.create(
    view.state.doc,
    plan.map((spacer) =>
      Decoration.widget(spacer.pos, () => createSpacer(spacer.height), {
        side: -1,
        key: `keep-together-${spacer.pos}-${spacer.height}`,
      }),
    ),
  )
  view.dispatch(
    view.state.tr.setMeta(keepTogetherKey, { decorations, plan } satisfies KeepTogetherState),
  )
}

function createKeepTogetherPlugin(types: Set<string>): Plugin<KeepTogetherState> {
  return new Plugin<KeepTogetherState>({
    key: keepTogetherKey,
    state: {
      init: () => ({ decorations: DecorationSet.empty, plan: [] }),
      apply(tr, value) {
        const meta = tr.getMeta(keepTogetherKey) as KeepTogetherState | undefined
        if (meta) return meta
        if (!tr.docChanged) return value
        // Map the previous plan/decorations so a doc change doesn't leave
        // widgets at stale positions until the next measurement.
        const plan = value.plan
          .map((spacer) => ({ ...spacer, pos: tr.mapping.map(spacer.pos) }))
          .filter((spacer) => spacer.pos >= 0 && spacer.pos <= tr.doc.content.size)
        return {
          decorations: value.decorations.map(tr.mapping, tr.doc),
          plan,
        }
      },
    },
    props: {
      decorations(state) {
        return keepTogetherKey.getState(state)?.decorations ?? DecorationSet.empty
      },
    },
    view: (view) => {
      if (typeof window === 'undefined' || typeof requestAnimationFrame === 'undefined') {
        return {}
      }
      let raf = 0
      const schedule = () => {
        if (raf) return
        raf = requestAnimationFrame(() => {
          raf = 0
          measure(view, types)
        })
      }
      schedule()
      const onResize = () => schedule()
      window.addEventListener('resize', onResize)
      return {
        update: () => schedule(),
        destroy: () => {
          if (raf) cancelAnimationFrame(raf)
          window.removeEventListener('resize', onResize)
        },
      }
    },
  })
}

export interface KeepTogetherOptions {
  /** Node types kept on one page when they fit. */
  types: string[]
}

/**
 * Transient keep-together pass for PaginationPlus. Does nothing in pageless or
 * virtual-pages mode (no `#pages` breakers), where layout is owned elsewhere.
 */
export const KeepTogetherExtension = Extension.create<KeepTogetherOptions>({
  name: 'keepTogether',
  addOptions() {
    return { types: ['blockquote', 'codeBlock'] }
  },
  addProseMirrorPlugins() {
    return [createKeepTogetherPlugin(new Set(this.options.types))]
  },
})
