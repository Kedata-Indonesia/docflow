import { watch, type Ref } from 'vue'
import type { DocsEditor } from '@kedata-indonesia/docflow-core'

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
  openFooterModal: () => void
  startInlineHeaderEdit: (event?: MouseEvent) => void
  updateBubbleMenu: () => void
  updatePageStats: () => void
  updateCounts: () => void
  scheduleCommentAnchorScan: () => void
  openLinkDialog: () => void
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
    openFooterModal,
    startInlineHeaderEdit,
    updateBubbleMenu,
    updatePageStats,
    updateCounts,
    scheduleCommentAnchorScan,
    openLinkDialog,
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
        updatePageStats()
      })
      editor.value.on('transaction', () => {
        updatePageStats()
        updateCounts()
        // Issue #133 — re-scan the doc for `comment` marks so threads
        // whose anchored text was deleted are flagged orphaned. Debounced
        // (~200 ms) so rapid keystrokes/merges don't thrash the walk.
        scheduleCommentAnchorScan()
      })
      updateBubbleMenu()
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

      // Handle clicks on top margin / page header area to activate header inline editing
      editor.value.view.dom.addEventListener('click', (e: MouseEvent) => {
        const target = e.target as HTMLElement | null
        if (!target) return

        // Ignore clicks on options dropdown, active bar tools, or active editable header
        if (target.closest('.rm-google-docs-header-bar, .rm-options-dropdown, [contenteditable="true"]')) return

        // Direct click on header or its children
        const headerEl = target.closest<HTMLElement>('.rm-page-header, .rm-first-page-header')
        if (headerEl) {
          startInlineHeaderEdit(e)
          return
        }

        // Click on top margin boundary area of editor or page
        const pageWrap = target.closest<HTMLElement>('.rm-with-pagination, .rm-page-break, .page, .docs-editor-page')
        if (pageWrap) {
          const rect = pageWrap.getBoundingClientRect()
          const relativeY = e.clientY - rect.top
          const topMarginPx = headerMarginCm.value * 37.795
          if (relativeY >= 0 && relativeY <= Math.max(topMarginPx, 40) + 15) {
            let targetHeader: HTMLElement | null = null
            if (pageWrap.classList.contains('rm-page-break')) {
              targetHeader = pageWrap.querySelector<HTMLElement>('.rm-page-header')
            }
            if (!targetHeader) {
              targetHeader = document.querySelector<HTMLElement>('.rm-page-header, .rm-first-page-header')
            }
            if (targetHeader) {
              startInlineHeaderEdit(e)
            }
          }
        }
      })

      // Handle double clicks on bottom margin / footer area to open footer modal
      editor.value.view.dom.addEventListener('dblclick', (e: MouseEvent) => {
        const target = e.target as HTMLElement | null
        if (!target) return

        const footerEl = target.closest<HTMLElement>('.rm-page-footer')
        if (footerEl) {
          openFooterModal()
          return
        }

        const pageWrap = target.closest<HTMLElement>('.rm-with-pagination, .rm-page-break, .page, .docs-editor-page')
        if (pageWrap) {
          const rect = pageWrap.getBoundingClientRect()
          const relativeY = rect.bottom - e.clientY
          const bottomMarginPx = footerMarginCm.value * 37.795
          if (relativeY >= 0 && relativeY <= Math.max(bottomMarginPx, 40) + 15) {
            openFooterModal()
          }
        }
      })
    }
  })
}
