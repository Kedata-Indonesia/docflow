/**
 * Geometry for the inline header edit overlay.
 *
 * Later-page headers live inside the full-bleed page breaker, so their element
 * rectangle spans the paper edge-to-edge while the header content is inset by
 * the body margins (`.rm-page-header-left/right` float margins). Vertically the
 * element reserves the whole top-margin zone and the text sits at the header
 * margin inside it, so the overlay aligns to the CONTENT rectangle. The
 * first-page header is absolutely positioned at the body margins with no
 * padding, so its rectangle already is the content rectangle.
 */
export interface HeaderOverlaySession {
  targetHeader: HTMLElement
  overlay: HTMLElement
  activeBar: HTMLElement
  isFirstPage: boolean
}

export function positionHeaderOverlay(session: HeaderOverlaySession, root: HTMLElement): void {
  if (!session.targetHeader.parentNode) return

  const headerRect = session.targetHeader.getBoundingClientRect()
  const paperRect = root.getBoundingClientRect()

  const paperStyle = getComputedStyle(root)
  const bodyMarginLeft = parseFloat(paperStyle.getPropertyValue('--rm-margin-left')) || 0
  const bodyMarginRight = parseFloat(paperStyle.getPropertyValue('--rm-margin-right')) || 0
  const contentEl = session.targetHeader.querySelector('.rm-page-header-content')
  const contentRect = contentEl?.getBoundingClientRect() ?? headerRect
  const contentLeft = session.isFirstPage ? headerRect.left : headerRect.left + bodyMarginLeft
  const contentRight = session.isFirstPage ? headerRect.right : headerRect.right - bodyMarginRight

  const leftInset = Math.max(0, contentLeft - paperRect.left)
  const rightInset = Math.max(0, paperRect.right - contentRight)

  session.overlay.style.left = `${contentLeft}px`
  session.overlay.style.top = `${contentRect.top}px`
  session.overlay.style.width = `${Math.max(contentRight - contentLeft, 1)}px`
  session.overlay.style.height = `${Math.max(contentRect.height, 24)}px`
  session.activeBar.style.setProperty('--rm-header-bar-left', `${-leftInset}px`)
  session.activeBar.style.setProperty('--rm-header-bar-width', `${paperRect.width}px`)
  session.activeBar.style.setProperty('--rm-header-bar-padding-left', `${leftInset}px`)
  session.activeBar.style.setProperty('--rm-header-bar-padding-right', `${rightInset}px`)
}
