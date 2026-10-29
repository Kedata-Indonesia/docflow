import { type Ref } from 'vue'
import { sanitizeInlineHTML, type DocsEditor } from '@kedata-indonesia/docflow-core'
import { positionFooterOverlay, positionHeaderOverlay } from './headerEditOverlay.js'
import { createHeaderEditBar, placeOptionsDropdown, wireHeaderEditBar } from './headerEditBar.js'
import { editableHTMLToInlineHTML } from './headerEditHtml.js'
import {
  detachSlotEditSession,
  generatedContentOf,
  type SlotEditSession,
} from './headerEditSession.js'
import { resolveSlotTarget } from './headerEditTarget.js'
import {
  createSlotValueAccessors,
  type HeaderSlotRefs,
  type SlotSide,
} from './headerEditValues.js'

export type { SlotSide } from './headerEditValues.js'

type Translate = (key: string, params?: Record<string, string | number>) => string

export interface UseHeaderEditOptions extends HeaderSlotRefs {
  editor: Ref<DocsEditor['editor'] | null>
  scrollContainerRef: Ref<HTMLElement | null>
  t: Translate
  applyHeaderFooter: () => void
  persistCurrentDoc: () => void
  openHeaderFormatModal: () => void
  openPageNumberModal: () => void
}

/**
 * Inline header/footer editing: a floating contenteditable overlay positioned
 * over a generated slot. Edits are committed back to the slot refs (never
 * ProseMirror), so the document JSON is untouched — Google Docs parity.
 *
 * Header and footer share this engine (issue #320). The only differences are
 * the target element, the value mapping (first/even/default) and which side of
 * the overlay the Options bar opens on.
 *
 * The moving parts live next door: `headerEditValues.ts` (slot refs ↔
 * first/even/default), `headerEditTarget.ts` (element + page number),
 * `headerEditBar.ts` (overlay markup and controls), `headerEditHtml.ts`
 * (contenteditable → inline HTML, #319) and `headerEditSession.ts` (teardown).
 */
export function useHeaderEdit(options: UseHeaderEditOptions) {
  const {
    editor,
    scrollContainerRef,
    t,
    isDifferentFirstPage,
    applyHeaderFooter,
    persistCurrentDoc,
    openHeaderFormatModal,
    openPageNumberModal,
  } = options

  const { getSlotValue, assignSlotValue, clearSlotContent } = createSlotValueAccessors(options, {
    applyHeaderFooter,
    persistCurrentDoc,
  })

  const headerEditSession: { value: SlotEditSession | null } = { value: null }

  const finishHeaderEdit = (commit = true) => {
    const session = headerEditSession.value
    if (!session) return

    // Never commit document-derived HTML: normalize the editable's block/newline
    // structure to <br> first (issue #319), then allowlist it before it reaches
    // the slot ref (and the PaginationPlus/v-html sinks) — issue #51.
    const value = sanitizeInlineHTML(editableHTMLToInlineHTML(session.input.innerHTML)).trim()
    detachSlotEditSession(session, scrollContainerRef.value)
    headerEditSession.value = null

    if (!commit) return

    assignSlotValue(session.side, session.pageIndex, value)

    applyHeaderFooter()
    persistCurrentDoc()
  }

  const syncOverlayHeight = (session: SlotEditSession) => {
    // The editable grows as the user adds lines. Grow the fixed overlay with it
    // so the Google-Docs-style bar (top/bottom: 100% of the overlay) follows the
    // text instead of staying at the original single-line height (issue #319).
    const height = session.input.getBoundingClientRect().height
    if (height > 0) session.overlay.style.height = `${height}px`
  }

  const positionSlotEdit = (session: SlotEditSession) => {
    if (!editor.value) return
    const root = editor.value.view.dom
    if (session.side === 'header') positionHeaderOverlay(session, root)
    else positionFooterOverlay(session, root)
    syncOverlayHeight(session)
  }

  const startInlineEdit = (side: SlotSide, event?: MouseEvent, element?: HTMLElement | null) => {
    const existing = headerEditSession.value
    if (existing) {
      const target = event?.target
      if (!target || target instanceof Node && existing.targetHeader.contains(target)) return
      finishHeaderEdit(false)
    }

    const root = editor.value?.view.dom
    if (!root) return

    const target = resolveSlotTarget({ side, root, event, element })
    if (!target) return
    const { slotEl, pageNumber } = target

    const generatedContent = generatedContentOf(slotEl, side)
    if (generatedContent) generatedContent.style.visibility = 'hidden'

    // Sanitize the seed too: the slot value is document-derived and writing it
    // unsanitized into this contenteditable would execute the payload (#51).
    const bar = createHeaderEditBar({
      side,
      t,
      seedValue: sanitizeInlineHTML(getSlotValue(side, pageNumber)),
      differentFirstPage: isDifferentFirstPage.value,
    })
    document.body.appendChild(bar.overlay)

    slotEl.classList.add(side === 'header' ? 'rm-header-active' : 'rm-footer-active')

    const reposition = () => {
      const current = headerEditSession.value
      if (!current) return
      positionSlotEdit(current)
      const openDropdown = current.activeBar.querySelector<HTMLElement>(
        '.rm-options-dropdown.is-open',
      )
      if (openDropdown) placeOptionsDropdown(openDropdown)
    }
    const onResize = reposition
    const onScroll = reposition
    const onWindowScroll = reposition
    const onOutsideMouseDown = (mouseEvent: MouseEvent) => {
      const target = mouseEvent.target
      if (target instanceof Node && bar.overlay.contains(target)) return
      if (target instanceof Element && target.closest('.fixed.z-50')) return
      finishHeaderEdit(true)
    }
    const onInputBlur = () => {
      requestAnimationFrame(() => {
        const current = headerEditSession.value
        if (current && !current.overlay.contains(document.activeElement)) finishHeaderEdit(true)
      })
    }

    const session: SlotEditSession = {
      side,
      targetHeader: slotEl,
      overlay: bar.overlay,
      input: bar.input,
      activeBar: bar.activeBar,
      generatedContent,
      isFirstPage: pageNumber === 1,
      pageIndex: pageNumber,
      onOutsideMouseDown,
      onInputBlur,
      onResize,
      onScroll,
      onWindowScroll,
    }
    headerEditSession.value = session

    wireHeaderEditBar(bar, {
      onCommit: () => finishHeaderEdit(true),
      onCancel: () => finishHeaderEdit(false),
      onRemove: () => clearSlotContent(side),
      onFormat: openHeaderFormatModal,
      onPageNumber: openPageNumberModal,
      onToggleDifferentFirstPage: (checked) => {
        // Document-level setting: enabling it gives BOTH the first-page header
        // and footer their own empty slots (Google Docs behaviour).
        if (checked) {
          options.userFirstPageHeaderLeft.value = ''
          options.userFirstPageHeaderRight.value = ''
          options.userFirstPageFooterLeft.value = ''
          options.userFirstPageFooterRight.value = ''
        }
        isDifferentFirstPage.value = checked
        applyHeaderFooter()
      },
    })

    bar.input.addEventListener('blur', onInputBlur)
    bar.input.addEventListener('input', () => {
      if (headerEditSession.value === session) syncOverlayHeight(session)
    })
    document.addEventListener('mousedown', onOutsideMouseDown)
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onWindowScroll)
    scrollContainerRef.value?.addEventListener('scroll', onScroll)
    // Position once the DOM/layout has settled (PaginationPlus may still be
    // rebuilding its generated widgets when the edit session starts).
    requestAnimationFrame(() => {
      if (headerEditSession.value === session) positionSlotEdit(session)
    })
    bar.input.focus()

    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(bar.input)
    range.collapse(false)
    selection?.removeAllRanges()
    selection?.addRange(range)
  }

  return {
    startInlineHeaderEdit: (event?: MouseEvent, element?: HTMLElement | null) => startInlineEdit('header', event, element),
    startInlineFooterEdit: (event?: MouseEvent, element?: HTMLElement | null) => startInlineEdit('footer', event, element),
    finishHeaderEdit,
  }
}
