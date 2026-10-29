import type { SlotSide } from './headerEditValues.js'

/** A resolved page slot plus the 1-based page it belongs to. */
export interface SlotTarget {
  slotEl: HTMLElement
  pageNumber: number
}

export function slotSelector(side: SlotSide): string {
  return side === 'header' ? '.rm-page-header, .rm-first-page-header' : '.rm-page-footer'
}

/** The generated text node the overlay hides while the user edits. */
export function generatedContentSelector(side: SlotSide): string {
  return side === 'header' ? '.rm-page-header-content' : '.rm-page-footer-content'
}

interface ResolveSlotTargetOptions {
  side: SlotSide
  /** PaginationPlus root (`editor.view.dom`). */
  root: HTMLElement
  /** Click that started the edit, when there is one. */
  event?: MouseEvent
  /** Slot the caller already resolved (margin clicks, issue #320). */
  element?: HTMLElement | null
}

/**
 * Find the slot element and its page number.
 *
 * Header: the first-page widget is page 1 and each `.rm-page-break
 * .rm-page-header` is the header of a later page (index + 2). Footer: there is
 * no separate first-page widget — the first `.rm-page-break .rm-page-footer` is
 * page 1 (index + 1). Returns `null` when the target is not a real page slot.
 */
export function resolveSlotTarget(options: ResolveSlotTargetOptions): SlotTarget | null {
  const { side, root, event, element } = options
  const selector = slotSelector(side)
  // Issue #320 — a click in the page margin has no header/footer element as its
  // target, so the caller resolves the slot that owns the band and passes it in.
  let slotEl: HTMLElement | null = element ?? null
  if (!slotEl && event) {
    const target = event.target as HTMLElement | null
    slotEl = target?.closest(selector) as HTMLElement | null
  }
  if (!slotEl) slotEl = root.querySelector(selector) as HTMLElement | null
  if (!slotEl) return null

  if (side === 'header') {
    const isFirstPage = slotEl.classList.contains('rm-first-page-header')
    const breakHeaders = Array.from(
      root.querySelectorAll<HTMLElement>('.rm-page-break .rm-page-header'),
    )
    const pageNumber = isFirstPage ? 1 : breakHeaders.indexOf(slotEl) + 2
    if (!isFirstPage && pageNumber < 2) return null
    return { slotEl, pageNumber }
  }

  const breakFooters = Array.from(
    root.querySelectorAll<HTMLElement>('.rm-page-break .rm-page-footer'),
  )
  const pageNumber = breakFooters.indexOf(slotEl) + 1
  if (pageNumber < 1) return null
  return { slotEl, pageNumber }
}
