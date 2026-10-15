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
 * Own-property lookup so an unknown action can never resolve to an inherited
 * `Object.prototype` member (e.g. `constructor`) and be called as a command.
 */
function ownCommand(
  commands: Record<string, () => void>,
  action: string,
): (() => void) | undefined {
  return Object.prototype.hasOwnProperty.call(commands, action) ? commands[action] : undefined
}

/**
 * Edit/Format menu dispatch extracted from DocsEditor. The command map
 * (`editFormatMenuCommands`) is owned by the component and injected here; the
 * library-owned command map (`menuCommands`) is built here and returned so its
 * key set is introspectable. Host-level menu actions are forwarded through the
 * injected `onShare` / `onMenuClick` callbacks so the component keeps owning its
 * emits.
 */
export function useDocsEditorMenu(
  options: UseDocsEditorMenuOptions,
): { menuClick: (action: string) => void; menuCommands: Record<string, () => void> } {
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

  // Document mode (#27/#28). No-op when it's already the active mode.
  const switchDocumentMode = (next: DocumentMode) => {
    if (documentMode.value !== next) onDocumentMode(next)
  }

  const insertFootnote = () => {
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
  }

  // Library-owned menu actions — the library performs them end to end, with no
  // host involvement. Kept as a command map (same style as
  // `editFormatMenuCommands`) so its key set *is* the classification source:
  // `LIBRARY_MENU_ACTIONS` in components/menuActions.ts mirrors these keys, and
  // `menuActions.drift.test.ts` fails if the two ever diverge (issue #153).
  const menuCommands: Record<string, () => void> = {
    'page-setup': () => openPageSetupModal(),
    print: () => handlePrint(),
    'version-history': () => toggleSidebar('history'),
    details: () => {
      showDetailsModal.value = true
    },
    email: () => {
      showEmailModal.value = true
    },
    'find-replace': () => {
      showFindReplace.value = true
    },
    'insert-link': () => openLinkDialog(),
    security: () => onShare(),
    'insert-header': () => startInlineHeaderEdit(),
    'insert-footer': () => openFooterModal(),
    'toggle-pageless': () => applyPageless(!isPageless.value),
    'toggle-left-sidebar': () => toggleSidebar('toc'),
    'toggle-ruler': () => {
      showRuler.value = !showRuler.value
    },
    'toggle-focus-mode': () => {
      focusMode.value = !focusMode.value
      if (focusMode.value) activeSidebar.value = null
    },
    'mode-editing': () => switchDocumentMode('editing'),
    'mode-suggesting': () => switchDocumentMode('suggesting'),
    'mode-viewing': () => switchDocumentMode('viewing'),
    // Track-changes review sidebar (#28, P2).
    'review-suggestions': () => toggleSidebar('review'),
    'new-help-me-create': () => toggleSidebar('ai'),
    'insert-footnote': insertFootnote,
  }

  const menuClick = (action: string) => {
    const command = ownCommand(menuCommands, action) ?? ownCommand(editFormatMenuCommands, action)
    if (command) {
      command()
    } else {
      onMenuClick(action)
    }
  }

  return { menuClick, menuCommands }
}
