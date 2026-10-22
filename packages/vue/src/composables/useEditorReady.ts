import { watch, type Ref } from 'vue'
import type { DocsEditor } from '@kedata-indonesia/docflow-core'

/**
 * Issue #320 — the header/footer widgets only cover their text box: the first-page header is
 * absolutely positioned on its text and the footer ends before the bottom margin. Clicking the
 * paper margin therefore has to be resolved against an explicit band, derived from the widget
 * rect plus the page margin — not from a fixed fudge factor that used to bleed into the body.
 *
 * Issue #354 — the band is vertical-only: the listener already receives clicks inside the paper,
 * so there is no x range to guard (the first-page header is narrower than the page).
 */
const MARGIN_BAND_PADDING = 8

function collectSlots(root: HTMLElement, side: 'header' | 'footer'): HTMLElement[] {
  return side === 'header'
    ? Array.from(root.querySelectorAll<HTMLElement>('.rm-first-page-header, .rm-page-break .rm-page-header'))
    : Array.from(root.querySelectorAll<HTMLElement>('.rm-page-break .rm-page-footer'))
}

/** Vertical band (viewport px) that counts as "this page's header/footer area". */
function marginBand(
  slot: HTMLElement,
  side: 'header' | 'footer',
  marginPx: number,
  paperTop: number,
): { top: number; bottom: number } | null {
  const rect = slot.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return null
  if (side === 'header') {
    // The first-page header sits on its text, so the empty margin above it belongs to the band.
    const top = slot.classList.contains('rm-first-page-header') ? Math.min(rect.top - marginPx, paperTop) : rect.top
    return { top: top - MARGIN_BAND_PADDING, bottom: rect.bottom + MARGIN_BAND_PADDING }
  }
  // The footer's bottom margin is outside its box, so the band runs to the margin end.
  return { top: rect.top - MARGIN_BAND_PADDING, bottom: rect.bottom + marginPx + MARGIN_BAND_PADDING }
}

function slotAtPoint(
  root: HTMLElement,
  side: 'header' | 'footer',
  y: number,
  marginPx: number,
  paperTop: number,
): HTMLElement | null {
  for (const slot of collectSlots(root, side)) {
    const band = marginBand(slot, side, marginPx, paperTop)
    if (!band || y < band.top || y > band.bottom) continue
    return slot
  }
  return null
}

export interface UseEditorReadyOptions {
  isReady: Ref<boolean>
  editor: Ref<DocsEditor['editor'] | null>
  docEditor: Ref<DocsEditor | null>
  userHeaderLeft: Ref<string>
  userHeaderRight: Ref<string>
  userFooterLeft: Ref<string>
  userFooterRight: Ref<string>
  headerMarginCm: Ref<number>
  footerMarginCm: Ref<number>
  applyHeaderFooter: () => void
  startInlineHeaderEdit: (event?: MouseEvent, element?: HTMLElement | null) => void
  startInlineFooterEdit: (event?: MouseEvent, element?: HTMLElement | null) => void
  updateBubbleMenu: () => void
  updateTableMenu: () => void
  updatePageStats: () => void
  updateCounts: () => void
  scheduleCommentAnchorScan: () => void
  openLinkDialog: () => void
  /** Issue #144 — visual zoom factor (1 at 100 %), read lazily. */
  getZoomScale?: () => number
  emit: (event: 'ready', docsEditor: DocsEditor) => void
}

/**
 * Editor bootstrap: everything that must run once the editor instance is
 * ready (header/footer seeding + paint, initial stats/comment scans, focus,
 * layout-adjustment transactions and the DOM-level link/header/footer
 * listeners). Extracted verbatim from DocsEditor so the component stays lean.
 *
 * The DOM listeners are intentionally never removed — matching the original
 * behaviour; teardown is tracked separately.
 */
export function useEditorReady(options: UseEditorReadyOptions) {
  const {
    isReady,
    editor,
    docEditor,
    userHeaderLeft,
    userHeaderRight,
    userFooterLeft,
    userFooterRight,
    headerMarginCm,
    footerMarginCm,
    applyHeaderFooter,
    startInlineHeaderEdit,
    startInlineFooterEdit,
    updateBubbleMenu,
    updateTableMenu,
    updatePageStats,
    updateCounts,
    scheduleCommentAnchorScan,
    openLinkDialog,
    getZoomScale,
    emit,
  } = options

  watch(isReady, (ready) => {
    if (ready && editor.value) {
      // Populate raw inputs from stored/loaded configuration if not already set by props
      if (!userHeaderLeft.value && !userHeaderRight.value && !userFooterLeft.value && !userFooterRight.value) {
        userHeaderLeft.value = editor.value.storage.PaginationPlus?.appliedConfig?.headerLeft || ''
        userHeaderRight.value = editor.value.storage.PaginationPlus?.appliedConfig?.headerRight || ''
        userFooterLeft.value = editor.value.storage.PaginationPlus?.appliedConfig?.footerLeft || ''
        userFooterRight.value = editor.value.storage.PaginationPlus?.appliedConfig?.footerRight || ''
      }

      // Apply header & footer with correct page stats
      applyHeaderFooter()

      if (docEditor.value) {
        emit('ready', docEditor.value)
      }
      editor.value.on('selectionUpdate', () => {
        updateBubbleMenu()
        updateTableMenu()
        updatePageStats()
      })
      editor.value.on('transaction', () => {
        updatePageStats()
        updateCounts()
        // Scroll is reported as a debounced empty transaction; recompute the
        // bubble menu so it follows the selection or hides once scrolled out
        // of view (#322).
        updateBubbleMenu()
        updateTableMenu()
        // Issue #133 — re-scan the doc for `comment` marks so threads
        // whose anchored text was deleted are flagged orphaned. Debounced
        // (~200 ms) so rapid keystrokes/merges don't thrash the walk.
        scheduleCommentAnchorScan()
      })
      updateBubbleMenu()
      updateTableMenu()
      updateCounts()
      updatePageStats()
      // Initial scan once the editor is ready. In collab mode this is a
      // no-op (guarded) until the Yjs doc has synced; in local mode it
      // flags orphans immediately against the seeded content.
      scheduleCommentAnchorScan()
      setTimeout(() => editor.value?.commands.focus('start'), 50)

      // Run layout adjustments after intervals to support async collaboration content loads
      const intervals = [100, 300, 600, 1200, 2500]
      intervals.forEach((delay) => {
        setTimeout(() => {
          if (editor.value) {
            editor.value.view.dispatch(editor.value.state.tr)
          }
        }, delay)
      })

      // Register ⌘K to open the link dialog (Google Docs shortcut).
      editor.value.view.dom.addEventListener('keydown', (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
          e.preventDefault()
          openLinkDialog()
        }
      })

      // Handle clicks on the page margins / header / footer to activate the
      // corresponding inline editor (Google Docs style).
      editor.value.view.dom.addEventListener('click', (e: MouseEvent) => {
        const target = e.target as HTMLElement | null
        if (!target) return
        const root = editor.value?.view.dom
        if (!root) return

        // Ignore the floating bar, its dropdown and the inline editors themselves.
        if (target.closest('.rm-google-docs-header-bar, .rm-options-dropdown, .rm-header-edit-overlay, .rm-footer-edit-overlay')) return
        if (target.closest('a, button, input, select, textarea')) return

        // Direct click on a generated header/footer widget or its children.
        const direct = target.closest<HTMLElement>('.rm-page-header, .rm-first-page-header, .rm-page-footer')
        if (direct) {
          if (direct.classList.contains('rm-page-footer')) startInlineFooterEdit(e, direct)
          else startInlineHeaderEdit(e, direct)
          return
        }

        // Issue #354 — a click on document content belongs to the document. The page widgets
        // live in `.rm-pages-wrapper`; the first-page header is a direct ProseMirror widget and
        // is handled above. Everything else inside the editor is content (paragraphs, images,
        // tables, custom nodes), so it can never be a margin band.
        if (target !== root && !target.closest('.rm-pages-wrapper')) return

        const paperTop = target.closest<HTMLElement>('.docs-editor__paper')?.getBoundingClientRect().top ?? 0
        // Rects are visual px under the zoom transform; margins are layout px (#144).
        const zoomScale = Math.max(0.01, getZoomScale?.() ?? 1)
        const headerBandPx = headerMarginCm.value * 37.795 * zoomScale
        const footerBandPx = footerMarginCm.value * 37.795 * zoomScale

        const headerSlot = slotAtPoint(root, 'header', e.clientY, headerBandPx, paperTop)
        if (headerSlot) {
          startInlineHeaderEdit(e, headerSlot)
          return
        }
        const footerSlot = slotAtPoint(root, 'footer', e.clientY, footerBandPx, paperTop)
        if (footerSlot) startInlineFooterEdit(e, footerSlot)
      })
    }
  })
}
