import type { Ref } from 'vue'
import type { DocsEditor, DocumentMode } from '@kedata-indonesia/docflow-core'
import type { useEditCommands } from './useEditCommands.js'
import type { useEditorChrome } from './useEditorChrome.js'
import type { useHeaderEdit } from './useHeaderEdit.js'
import type { useHeaderFooter } from './useHeaderFooter.js'
import type { useLinkDialog } from './useLinkDialog.js'
import type { usePageSetup } from './usePageSetup.js'
import type { usePageStats } from './usePageStats.js'

export interface UseDocsEditorMenuOptions {
  editor: Ref<DocsEditor['editor'] | null>
  focusMode: Ref<boolean>
  showFindReplace: Ref<boolean>
  editFormatMenuCommands: ReturnType<typeof useEditCommands>['editFormatMenuCommands']
  isPageless: Ref<boolean>
  showRuler: ReturnType<typeof useEditorChrome>['showRuler']
  activeSidebar: ReturnType<typeof useEditorChrome>['activeSidebar']
  getUpdateFootnotes: () => void
  openPageSetupModal: ReturnType<typeof usePageSetup>['openPageSetupModal']
  handlePrint: ReturnType<typeof useEditorChrome>['handlePrint']
  toggleSidebar: ReturnType<typeof useEditorChrome>['toggleSidebar']
  startInlineHeaderEdit: ReturnType<typeof useHeaderEdit>['startInlineHeaderEdit']
  openFooterModal: ReturnType<typeof useHeaderFooter>['openFooterModal']
  openLinkDialog: ReturnType<typeof useLinkDialog>['openLinkDialog']
  applyPageless: ReturnType<typeof usePageStats>['applyPageless']
  documentMode: Ref<DocumentMode>
  onDocumentMode: (mode: DocumentMode) => void
  showDetailsModal: Ref<boolean>
  showEmailModal: Ref<boolean>
  onShare: () => void
  onMenuClick: (action: string) => void
}

/**
 * Edit/Format menu dispatch extracted from DocsEditor. The command map
 * (`editFormatMenuCommands`) is owned by the component and injected here; only
 * `menuClick` is part of this module's public surface. Host-level menu actions
 * are forwarded through the injected `onShare` / `onMenuClick` callbacks so the
 * component keeps owning its emits.
 */
export function useDocsEditorMenu(
  options: UseDocsEditorMenuOptions,
): { menuClick: (action: string) => void } {
  const {
    editor,
    focusMode,
    showFindReplace,
    editFormatMenuCommands,
    isPageless,
    showRuler,
    activeSidebar,
    getUpdateFootnotes,
    openPageSetupModal,
    handlePrint,
    toggleSidebar,
    startInlineHeaderEdit,
    openFooterModal,
    openLinkDialog,
    applyPageless,
    showDetailsModal,
    showEmailModal,
    documentMode,
    onDocumentMode,
    onShare,
    onMenuClick,
  } = options

  const menuClick = (action: string) => {
    if (action === 'page-setup') {
      openPageSetupModal()
    } else if (action === 'print') {
      handlePrint()
    } else if (action === 'version-history') {
      toggleSidebar('history')
    } else if (action === 'details') {
      showDetailsModal.value = true
    } else if (action === 'email') {
      showEmailModal.value = true
    } else if (action === 'find-replace') {
      showFindReplace.value = true
    } else if (action === 'insert-link') {
      openLinkDialog()
    } else if (action === 'security') {
      onShare()
    } else if (action === 'insert-header') {
      startInlineHeaderEdit()
    } else if (action === 'insert-footer') {
      openFooterModal()
    } else if (action === 'toggle-pageless') {
      applyPageless(!isPageless.value)
    } else if (action === 'toggle-left-sidebar') {
      toggleSidebar('toc')
    } else if (action === 'toggle-ruler') {
      showRuler.value = !showRuler.value
    } else if (action === 'toggle-focus-mode') {
      focusMode.value = !focusMode.value
      if (focusMode.value) activeSidebar.value = null
    } else if (action === 'mode-editing' || action === 'mode-suggesting' || action === 'mode-viewing') {
      // Document mode (#27/#28). No-op when it's already the active mode.
      const next = action.replace('mode-', '') as DocumentMode
      if (documentMode.value !== next) onDocumentMode(next)
    } else if (action === 'review-suggestions') {
      // Track-changes review sidebar (#28, P2).
      toggleSidebar('review')
    } else if (action === 'new-help-me-create') {
      toggleSidebar('ai')
    } else if (action === 'insert-footnote') {
      // Use ProseMirror's transaction API directly — more reliable than chain()
      // because chain().focus() can fail when focus has left the editor via menu click.
      if (!editor.value) return
      const { state, view } = editor.value
      const footnoteType = state.schema.nodes['footnote']
      if (!footnoteType) {
        console.error('[DocsEditor] footnote node type not registered in schema')
        return
      }
      // Insert at the last known cursor position
      const insertPos = state.selection.head
      const footnoteNode = footnoteType.create({ content: '' })
      const tr = state.tr.insert(insertPos, footnoteNode)
      view.dispatch(tr)
      view.focus()

      // After DOM settles: build footnote list and focus the new text area
      setTimeout(() => {
        getUpdateFootnotes()
        const items = document.querySelectorAll<HTMLElement>('.docs-footnote-item-text')
        const last = items[items.length - 1]
        if (last) {
          last.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          last.focus()
        }
      }, 160)
    } else if (editFormatMenuCommands[action]) {
      editFormatMenuCommands[action]()
    } else {
      onMenuClick(action)
    }
  }

  return { menuClick }
}
