import type { HeaderOverlaySession } from './headerEditOverlay.js'
import { generatedContentSelector } from './headerEditTarget.js'
import type { SlotSide } from './headerEditValues.js'

/** One live inline header/footer edit: the overlay plus its teardown hooks. */
export interface SlotEditSession extends HeaderOverlaySession {
  side: SlotSide
  input: HTMLElement
  generatedContent: HTMLElement | null
  pageIndex: number
  onOutsideMouseDown: (event: MouseEvent) => void
  onInputBlur: () => void
  onResize: () => void
  onScroll: () => void
  onWindowScroll: () => void
}

/** The generated text node the overlay covers while editing, if present. */
export function generatedContentOf(slotEl: HTMLElement, side: SlotSide): HTMLElement | null {
  return slotEl.querySelector<HTMLElement>(generatedContentSelector(side))
}

/**
 * Tear down a session: drop every listener exactly once, remove the overlay and
 * restore the slot's generated content. Committing the value is the caller's
 * job — it happens after the DOM is back to its resting state.
 */
export function detachSlotEditSession(
  session: SlotEditSession,
  scrollContainer: HTMLElement | null,
): void {
  document.removeEventListener('mousedown', session.onOutsideMouseDown)
  window.removeEventListener('resize', session.onResize)
  window.removeEventListener('scroll', session.onWindowScroll)
  scrollContainer?.removeEventListener('scroll', session.onScroll)
  session.overlay.remove()
  if (session.generatedContent) session.generatedContent.style.visibility = ''
  session.targetHeader.classList.remove('rm-header-active', 'rm-footer-active')
}
