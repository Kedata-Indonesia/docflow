import type { SlotSide } from './headerEditValues.js'

type Translate = (key: string, params?: Record<string, string | number>) => string

export interface HeaderEditBarOptions {
  side: SlotSide
  t: Translate
  /** Sanitized slot value shown when the editable opens. */
  seedValue: string
  differentFirstPage: boolean
}

/** The floating editable plus its Google-Docs-style bar. */
export interface HeaderEditBar {
  overlay: HTMLElement
  input: HTMLElement
  activeBar: HTMLElement
}

export interface HeaderEditBarHandlers {
  /** Commit the current edit and close the session. */
  onCommit: () => void
  /** Close without committing. */
  onCancel: () => void
  onRemove: () => void
  onToggleDifferentFirstPage: (checked: boolean) => void
  onFormat: () => void
  onPageNumber: () => void
}

/**
 * Build the overlay markup and wire its controls. Labels come from the active
 * locale with an English fallback, and the seed value is already sanitized by
 * the caller — writing it unsanitized would execute the payload (#51).
 */
export function createHeaderEditBar(options: HeaderEditBarOptions): HeaderEditBar {
  const { side, t, seedValue, differentFirstPage } = options
  const isHeader = side === 'header'
  const label = (key: string, fallback: string): string => t(key) || fallback

  const sideLabel = label(
    isHeader ? 'editor.headerFooter.header' : 'editor.headerFooter.footer',
    isHeader ? 'Header' : 'Footer',
  )
  const formatLabel = label(
    isHeader ? 'editor.headerFooter.formatHeader' : 'editor.headerFooter.formatFooter',
    isHeader ? 'Header format' : 'Footer format',
  )
  const removeLabel = label(
    isHeader ? 'editor.headerFooter.removeHeader' : 'editor.headerFooter.removeFooter',
    isHeader ? 'Remove header' : 'Remove footer',
  )

  const input = document.createElement('div')
  input.className = 'rm-header-edit-input'
  input.contentEditable = 'true'
  input.setAttribute('role', 'textbox')
  input.setAttribute('aria-label', sideLabel)
  input.dataset.placeholder = label(
    isHeader ? 'editor.headerFooter.headerPlaceholder' : 'editor.headerFooter.footerPlaceholder',
    isHeader ? 'Header' : 'Footer',
  )
  input.innerHTML = seedValue

  const overlay = document.createElement('div')
  overlay.className = isHeader ? 'rm-header-edit-overlay' : 'rm-footer-edit-overlay'
  overlay.appendChild(input)

  const activeBar = document.createElement('div')
  activeBar.className = 'rm-google-docs-header-bar'
  activeBar.innerHTML = `
    <span class="rm-header-label">${sideLabel}</span>
    <div class="rm-header-right-tools">
      <label class="rm-diff-label">
        <input type="checkbox" class="rm-diff-cb" ${differentFirstPage ? 'checked' : ''}>
        <span>${label('editor.headerFooter.differentFirstPage', 'Different first page')}</span>
      </label>
      <div class="rm-options-wrapper">
        <button type="button" class="rm-options-btn">
          <span>${label('editor.headerFooter.options', 'Options')}</span>
          <span class="rm-arrow-icon" style="font-size: 8px;">▼</span>
        </button>
        <div class="rm-options-dropdown">
          <button type="button" class="rm-opt-format">${formatLabel}</button>
          <button type="button" class="rm-opt-page-num">${label('editor.headerFooter.pageNumber', 'Page numbers')}</button>
          <button type="button" class="rm-opt-remove">${removeLabel}</button>
        </div>
      </div>
    </div>
  `
  overlay.appendChild(activeBar)

  return { overlay, input, activeBar }
}

/**
 * The footer bar sits just above the footer text, i.e. close to the bottom of
 * the viewport. The options menu must flip upward there or its last item (Page
 * numbers) is clipped (footer page-number bug).
 */
export function placeOptionsDropdown(openDropdown: HTMLElement): void {
  openDropdown.classList.remove('opens-up')
  const wrapper = openDropdown.closest('.rm-options-wrapper')
  const button = wrapper?.querySelector<HTMLElement>('.rm-options-btn')
  if (!button) return
  const rect = button.getBoundingClientRect()
  const height = openDropdown.offsetHeight
  const spaceBelow = window.innerHeight - rect.bottom
  if (spaceBelow < height + 8 && rect.top >= height + 8) {
    openDropdown.classList.add('opens-up')
  }
}

/** Keeps the click that follows `mousedown` from reaching the outside-click handler. */
function stopMouseDown(event: MouseEvent): void {
  event.stopPropagation()
  event.preventDefault()
}

export function wireHeaderEditBar(bar: HeaderEditBar, handlers: HeaderEditBarHandlers): void {
  const { activeBar } = bar

  const checkbox = activeBar.querySelector('.rm-diff-cb') as HTMLInputElement | null
  checkbox?.addEventListener('mousedown', (mouseEvent) => {
    mouseEvent.stopPropagation()
  })
  checkbox?.addEventListener('change', (changeEvent) => {
    changeEvent.stopPropagation()
    const checked = (changeEvent.target as HTMLInputElement).checked
    handlers.onCommit()
    handlers.onToggleDifferentFirstPage(checked)
  })

  const optionsButton = activeBar.querySelector('.rm-options-btn') as HTMLButtonElement | null
  const dropdown = activeBar.querySelector('.rm-options-dropdown') as HTMLElement | null
  const arrow = activeBar.querySelector('.rm-arrow-icon') as HTMLElement | null
  optionsButton?.addEventListener('mousedown', stopMouseDown)
  optionsButton?.addEventListener('click', (clickEvent) => {
    clickEvent.stopPropagation()
    clickEvent.preventDefault()
    const open = !(dropdown?.classList.contains('is-open') ?? false)
    dropdown?.classList.toggle('is-open', open)
    if (arrow) arrow.textContent = open ? '▲' : '▼'
    if (open && dropdown) placeOptionsDropdown(dropdown)
  })

  const formatButton = activeBar.querySelector('.rm-opt-format') as HTMLButtonElement | null
  formatButton?.addEventListener('mousedown', stopMouseDown)
  formatButton?.addEventListener('click', (clickEvent) => {
    clickEvent.stopPropagation()
    handlers.onCommit()
    handlers.onFormat()
  })

  const pageNumberButton = activeBar.querySelector('.rm-opt-page-num') as HTMLButtonElement | null
  pageNumberButton?.addEventListener('mousedown', stopMouseDown)
  pageNumberButton?.addEventListener('click', (clickEvent) => {
    clickEvent.stopPropagation()
    handlers.onCommit()
    handlers.onPageNumber()
  })

  const removeButton = activeBar.querySelector('.rm-opt-remove') as HTMLButtonElement | null
  removeButton?.addEventListener('mousedown', stopMouseDown)
  removeButton?.addEventListener('click', (clickEvent) => {
    clickEvent.stopPropagation()
    handlers.onCancel()
    handlers.onRemove()
  })
}
