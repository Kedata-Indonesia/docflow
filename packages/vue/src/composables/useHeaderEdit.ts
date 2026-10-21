import { type Ref } from 'vue'
import { sanitizeInlineHTML, type DocsEditor } from '@kedata-indonesia/docflow-core'
import { positionHeaderOverlay, type HeaderOverlaySession } from './headerEditOverlay.js'

/** Elements a contenteditable uses to represent a new line (Enter). */
const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'dd', 'div', 'dl', 'dt', 'fieldset',
  'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header',
  'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'tbody', 'td', 'tfoot',
  'th', 'thead', 'tr', 'ul',
])

const INLINE_TAGS = new Set(['b', 'strong', 'i', 'em', 'u'])

/**
 * Convert a contenteditable's block/newline structure into inline HTML with
 * explicit `<br>` separators. Chromium represents Enter as sibling `<div>`s and
 * Shift+Enter as a text newline; `sanitizeInlineHTML` unwraps blocks, so without
 * this a multi-line header collapses onto a single line (issue #319).
 */
function editableHTMLToInlineHTML(html: string): string {
  if (!html) return ''
  const SENTINEL = '\u0000'
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const parts: string[] = []

  const serialize = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) {
        // Shift+Enter can arrive as a literal newline inside a text node.
        parts.push((child.textContent || '').replace(/\r?\n/g, SENTINEL))
        continue
      }
      if (child.nodeType !== 1) continue

      const el = child as Element
      const tag = el.tagName.toLowerCase()
      if (tag === 'br') {
        parts.push(SENTINEL)
        continue
      }

      const isBlock = BLOCK_TAGS.has(tag)
      // A block starts on a new line unless we are at the very start or the
      // previous token already broke the line.
      if (isBlock && parts.length > 0 && !parts[parts.length - 1].endsWith(SENTINEL)) {
        parts.push(SENTINEL)
      }
      if (INLINE_TAGS.has(tag)) {
        parts.push(`<${tag}>`)
        serialize(el)
        parts.push(`</${tag}>`)
      } else {
        serialize(el)
      }
      // A block ends with a line break (trimmed later at the very end).
      if (isBlock) parts.push(SENTINEL)
    }
  }

  serialize(doc.body)
  const lines = parts.join('').split(SENTINEL)
  while (lines.length > 0 && lines[0] === '') lines.shift()
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines.join('<br>')
}

export interface UseHeaderEditOptions {
  editor: Ref<DocsEditor['editor'] | null>
  scrollContainerRef: Ref<HTMLElement | null>
  t: (key: string, params?: Record<string, string | number>) => string
  isDifferentFirstPage: Ref<boolean>
  isDifferentOddEven: Ref<boolean>
  userHeaderLeft: Ref<string>
  userHeaderRight: Ref<string>
  userFirstPageHeaderLeft: Ref<string>
  userFirstPageHeaderRight: Ref<string>
  userEvenPageHeaderLeft: Ref<string>
  applyHeaderFooter: () => void
  persistCurrentDoc: () => void
  openHeaderFormatModal: () => void
  openPageNumberModal: () => void
}

interface HeaderEditSession extends HeaderOverlaySession {
  input: HTMLElement
  generatedContent: HTMLElement | null
  pageIndex: number
  onOutsideMouseDown: (event: MouseEvent) => void
  onInputBlur: () => void
  onResize: () => void
  onScroll: () => void
  onWindowScroll: () => void
}

/**
 * Inline header editing: a floating contenteditable overlay positioned over a
 * generated header widget. Edits are committed back to the header content refs
 * (never ProseMirror), so the document JSON is untouched — Google Docs parity.
 */
export function useHeaderEdit(options: UseHeaderEditOptions) {
  const {
    editor,
    scrollContainerRef,
    t,
    isDifferentFirstPage,
    isDifferentOddEven,
    userHeaderLeft,
    userHeaderRight,
    userFirstPageHeaderLeft,
    userFirstPageHeaderRight,
    userEvenPageHeaderLeft,
    applyHeaderFooter,
    persistCurrentDoc,
    openHeaderFormatModal,
    openPageNumberModal,
  } = options

  const headerEditSession: { value: HeaderEditSession | null } = { value: null }

  const getHeaderEditValue = (pageNumber: number): string => {
    const isFirstPage = pageNumber === 1
    const isEvenPage = pageNumber % 2 === 0
    if (isDifferentFirstPage.value && isFirstPage) return userFirstPageHeaderLeft.value
    if (isDifferentOddEven.value && isEvenPage) return userEvenPageHeaderLeft.value
    return userHeaderLeft.value
  }

  const finishHeaderEdit = (commit = true) => {
    const session = headerEditSession.value
    if (!session) return

    // Never commit document-derived HTML: normalize the editable's block/newline
    // structure to <br> first (issue #319), then allowlist it before it reaches
    // the slot ref (and the PaginationPlus/v-html sinks) — issue #51.
    const value = sanitizeInlineHTML(editableHTMLToInlineHTML(session.input.innerHTML)).trim()
    document.removeEventListener('mousedown', session.onOutsideMouseDown)
    window.removeEventListener('resize', session.onResize)
    window.removeEventListener('scroll', session.onWindowScroll)
    scrollContainerRef.value?.removeEventListener('scroll', session.onScroll)
    session.overlay.remove()
    if (session.generatedContent) session.generatedContent.style.visibility = ''
    session.targetHeader.classList.remove('rm-header-active')
    headerEditSession.value = null

    if (!commit) return

    if (isDifferentFirstPage.value && session.isFirstPage) {
      userFirstPageHeaderLeft.value = value
    } else if (isDifferentOddEven.value && session.pageIndex % 2 === 0) {
      userEvenPageHeaderLeft.value = value
    } else {
      userHeaderLeft.value = value
    }

    applyHeaderFooter()
    persistCurrentDoc()
  }

  const clearHeaderContent = () => {
    userHeaderLeft.value = ''
    userHeaderRight.value = ''
    applyHeaderFooter()
    persistCurrentDoc()
  }

  const syncOverlayHeight = (session: HeaderEditSession) => {
    // The editable grows as the user adds lines. Grow the fixed overlay with it
    // so the Google-Docs-style bar (`top: 100%` of the overlay) follows the text
    // instead of staying at the original single-line height (issue #319).
    const height = session.input.getBoundingClientRect().height
    if (height > 0) session.overlay.style.height = `${height}px`
  }

  const positionHeaderEdit = (session: HeaderEditSession) => {
    if (!editor.value) return
    positionHeaderOverlay(session, editor.value.view.dom)
    syncOverlayHeight(session)
  }

  const startInlineHeaderEdit = (event?: MouseEvent) => {
    const existing = headerEditSession.value
    if (existing) {
      const target = event?.target
      if (!target || target instanceof Node && existing.targetHeader.contains(target)) return
      finishHeaderEdit(false)
    }

    let headerEl: HTMLElement | null = null
    if (event) {
      const target = event.target as HTMLElement | null
      headerEl = target?.closest('.rm-page-header, .rm-first-page-header') as HTMLElement | null
    }
    if (!headerEl) {
      headerEl = editor.value?.view.dom.querySelector('.rm-first-page-header, .rm-page-header') as HTMLElement | null
    }
    if (!headerEl || !editor.value) return

    const root = editor.value.view.dom
    // Explicit page mapping: the first-page header widget is page 1; each
    // `.rm-page-break .rm-page-header` is the header of a later page. Note the
    // first-page header also carries the `rm-page-header` class, so a flat
    // `.rm-page-header` query cannot be indexed for page numbers.
    const isFirstPage = headerEl.classList.contains('rm-first-page-header')
    const breakHeaders = Array.from(root.querySelectorAll<HTMLElement>('.rm-page-break .rm-page-header'))
    const pageNumber = isFirstPage ? 1 : breakHeaders.indexOf(headerEl) + 2
    if (!isFirstPage && pageNumber < 2) return
    const generatedContent = headerEl.querySelector('.rm-page-header-content') as HTMLElement | null
    if (generatedContent) generatedContent.style.visibility = 'hidden'
    const input = document.createElement('div')
    input.className = 'rm-header-edit-input'
    input.contentEditable = 'true'
    input.setAttribute('role', 'textbox')
    input.setAttribute('aria-label', t('editor.headerFooter.header') || 'Header')
    input.dataset.placeholder = t('editor.headerFooter.headerPlaceholder') || 'Header'
    // Sanitize the seed too: the slot value is document-derived and writing it
    // unsanitized into this contenteditable would execute the payload (#51).
    input.innerHTML = sanitizeInlineHTML(getHeaderEditValue(pageNumber))

    const overlay = document.createElement('div')
    overlay.className = 'rm-header-edit-overlay'
    overlay.appendChild(input)
    const activeBar = document.createElement('div')
    activeBar.className = 'rm-google-docs-header-bar'
    activeBar.innerHTML = `
    <span class="rm-header-label">${t('editor.headerFooter.header') || 'Header'}</span>
    <div class="rm-header-right-tools">
      <label class="rm-diff-label">
        <input type="checkbox" class="rm-diff-cb" ${isDifferentFirstPage.value ? 'checked' : ''}>
        <span>${t('editor.headerFooter.differentFirstPage') || 'Different first page'}</span>
      </label>
      <div class="rm-options-wrapper">
        <button type="button" class="rm-options-btn">
          <span>${t('editor.headerFooter.options') || 'Options'}</span>
          <span class="rm-arrow-icon" style="font-size: 8px;">▼</span>
        </button>
        <div class="rm-options-dropdown">
          <button type="button" class="rm-opt-format">${t('editor.headerFooter.formatHeader') || 'Header format'}</button>
          <button type="button" class="rm-opt-page-num">${t('editor.headerFooter.pageNumber') || 'Page numbers'}</button>
          <button type="button" class="rm-opt-remove">${t('editor.headerFooter.removeHeader') || 'Remove header'}</button>
        </div>
      </div>
    </div>
  `
    overlay.appendChild(activeBar)
    document.body.appendChild(overlay)

    headerEl.classList.add('rm-header-active')

    const onResize = () => {
      const current = headerEditSession.value
      if (current) positionHeaderEdit(current)
    }
    const onScroll = onResize
    const onWindowScroll = onResize
    const onOutsideMouseDown = (mouseEvent: MouseEvent) => {
      const target = mouseEvent.target
      if (target instanceof Node && overlay.contains(target)) return
      if (target instanceof Element && target.closest('.fixed.z-50')) return
      finishHeaderEdit(true)
    }
    const onInputBlur = () => {
      requestAnimationFrame(() => {
        const current = headerEditSession.value
        if (current && !current.overlay.contains(document.activeElement)) finishHeaderEdit(true)
      })
    }

    const session: HeaderEditSession = {
      targetHeader: headerEl,
      overlay,
      input,
      activeBar,
      generatedContent,
      isFirstPage,
      pageIndex: pageNumber,
      onOutsideMouseDown,
      onInputBlur,
      onResize,
      onScroll,
      onWindowScroll,
    }
    headerEditSession.value = session

    const checkbox = activeBar.querySelector('.rm-diff-cb') as HTMLInputElement | null
    checkbox?.addEventListener('mousedown', (mouseEvent) => {
      mouseEvent.stopPropagation()
    })
    checkbox?.addEventListener('change', (changeEvent) => {
      changeEvent.stopPropagation()
      const checked = (changeEvent.target as HTMLInputElement).checked
      finishHeaderEdit(true)
      if (checked) {
        userFirstPageHeaderLeft.value = ''
        userFirstPageHeaderRight.value = ''
      }
      isDifferentFirstPage.value = checked
      applyHeaderFooter()
    })

    const optionsButton = activeBar.querySelector('.rm-options-btn') as HTMLButtonElement | null
    const dropdown = activeBar.querySelector('.rm-options-dropdown') as HTMLElement | null
    const arrow = activeBar.querySelector('.rm-arrow-icon') as HTMLElement | null
    optionsButton?.addEventListener('mousedown', (mouseEvent) => {
      mouseEvent.stopPropagation()
      mouseEvent.preventDefault()
    })
    optionsButton?.addEventListener('click', (clickEvent) => {
      clickEvent.stopPropagation()
      clickEvent.preventDefault()
      const open = dropdown?.classList.toggle('is-open') ?? false
      if (arrow) arrow.textContent = open ? '▲' : '▼'
    })

    const formatButton = activeBar.querySelector('.rm-opt-format') as HTMLButtonElement | null
    formatButton?.addEventListener('mousedown', (mouseEvent) => {
      mouseEvent.stopPropagation()
      mouseEvent.preventDefault()
    })
    formatButton?.addEventListener('click', (clickEvent) => {
      clickEvent.stopPropagation()
      finishHeaderEdit(true)
      openHeaderFormatModal()
    })

    const pageNumberButton = activeBar.querySelector('.rm-opt-page-num') as HTMLButtonElement | null
    pageNumberButton?.addEventListener('mousedown', (mouseEvent) => {
      mouseEvent.stopPropagation()
      mouseEvent.preventDefault()
    })
    pageNumberButton?.addEventListener('click', (clickEvent) => {
      clickEvent.stopPropagation()
      finishHeaderEdit(true)
      openPageNumberModal()
    })

    const removeButton = activeBar.querySelector('.rm-opt-remove') as HTMLButtonElement | null
    removeButton?.addEventListener('mousedown', (mouseEvent) => {
      mouseEvent.stopPropagation()
      mouseEvent.preventDefault()
    })
    removeButton?.addEventListener('click', (clickEvent) => {
      clickEvent.stopPropagation()
      finishHeaderEdit(false)
      clearHeaderContent()
    })

    input.addEventListener('blur', onInputBlur)
    input.addEventListener('input', () => {
      if (headerEditSession.value === session) syncOverlayHeight(session)
    })
    document.addEventListener('mousedown', onOutsideMouseDown)
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onWindowScroll)
    scrollContainerRef.value?.addEventListener('scroll', onScroll)
    // Position once the DOM/layout has settled (PaginationPlus may still be
    // rebuilding its generated widgets when the edit session starts).
    requestAnimationFrame(() => {
      if (headerEditSession.value === session) positionHeaderEdit(session)
    })
    input.focus()

    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(input)
    range.collapse(false)
    selection?.removeAllRanges()
    selection?.addRange(range)
  }

  return {
    startInlineHeaderEdit,
    finishHeaderEdit,
  }
}
