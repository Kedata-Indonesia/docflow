import type { Ref } from 'vue'
import type { DocsEditor } from '@kedata-indonesia/docflow-core'
import { useEditClipboard } from './editClipboard.js'
import { useEditKeyboard } from './editKeyboard.js'

export { EDIT_FORMAT_MENU_ACTIONS } from './editFormatActions.js'

export interface UseEditCommandsOptions {
  editor: Ref<DocsEditor['editor'] | null>
  pluginActions: Ref<DocsEditor['pluginActions']>
  focusMode: Ref<boolean>
  showFindReplace: Ref<boolean>
  userHeaderRight: Ref<string>
  userFooterRight: Ref<string>
  applyHeaderFooter: () => void
  persistCurrentDoc: () => void
}

// Editor-scoped menu actions are executed in-library (the library owns command
// execution); they are never emitted to the host app. All dispatch is defensive:
// a missing command (e.g. undo in collab mode where StarterKit history is off,
// or a plugin the host didn't load) is a no-op, never a crash.
export function useEditCommands(options: UseEditCommandsOptions) {
  const {
    editor,
    pluginActions,
    focusMode,
    showFindReplace,
    userHeaderRight,
    userFooterRight,
    applyHeaderFooter,
    persistCurrentDoc,
  } = options

  // Call a native TipTap command by name, then refocus the editor.
  const runMenuEditorCommand = (name: string, ...args: unknown[]) => {
    if (!editor.value) return
    const command = (editor.value.commands as Record<string, ((...a: unknown[]) => unknown) | undefined>)[name]
    if (typeof command === 'function') command(...args)
    editor.value.commands.focus()
  }

  // Plugin-backed actions (alignment, task list) go through pluginActions first so
  // custom plugin commands win; fall back to a native command of the same name.
  const runPluginMenuAction = (action: string, ...args: unknown[]) => {
    if (!editor.value) return
    const fn = pluginActions.value[action]
    if (typeof fn === 'function') {
      fn(...args)
    } else {
      runMenuEditorCommand(action, ...args)
      return
    }
    editor.value.commands.focus()
  }

  // Insert the {page} placeholder into the header or footer (right slot, Google
  // Docs style). tiptap-pagination-plus renders {page} per page; {total} is
  // resolved by applyHeaderFooter. Persisted via the shared doc pipeline.
  const insertPageNumber = (slot: 'header' | 'footer') => {
    const target = slot === 'header' ? userHeaderRight : userFooterRight
    if (!target.value.includes('{page}')) {
      target.value = target.value ? `${target.value} {page}` : '{page}'
    }
    applyHeaderFooter()
    persistCurrentDoc()
  }

  const { handleCut, handleCopy, handlePaste, handlePastePlain, handleDeleteSelection } =
    useEditClipboard({ editor })

  useEditKeyboard({ editor, focusMode, showFindReplace, pastePlain: handlePastePlain })

  const editFormatMenuCommands: Record<string, () => void> = {
    // Edit menu
    undo: () => runMenuEditorCommand('undo'),
    redo: () => runMenuEditorCommand('redo'),
    'select-all': () => runMenuEditorCommand('selectAll'),
    cut: () => { void handleCut() },
    copy: () => { void handleCopy() },
    paste: () => { void handlePaste() },
    'paste-without-formatting': () => { void handlePastePlain() },
    delete: () => handleDeleteSelection(),
    // Format menu — text styles
    bold: () => runMenuEditorCommand('toggleBold'),
    italic: () => runMenuEditorCommand('toggleItalic'),
    underline: () => runMenuEditorCommand('toggleUnderline'),
    heading1: () => runMenuEditorCommand('toggleHeading', { level: 1 }),
    heading2: () => runMenuEditorCommand('toggleHeading', { level: 2 }),
    heading3: () => runMenuEditorCommand('toggleHeading', { level: 3 }),
    // Format menu — align & indent (alignment plugin + core IndentExtension)
    'align-left': () => runPluginMenuAction('alignLeft'),
    'align-center': () => runPluginMenuAction('alignCenter'),
    'align-right': () => runPluginMenuAction('alignRight'),
    'align-justify': () => runPluginMenuAction('alignJustify'),
    indent: () => runMenuEditorCommand('indent'),
    outdent: () => runMenuEditorCommand('outdent'),
    // Format menu — bullets & numbering (StarterKit lists + lists plugin)
    'bullet-list': () => runMenuEditorCommand('toggleBulletList'),
    'numbered-list': () => runMenuEditorCommand('toggleOrderedList'),
    'task-list': () => runPluginMenuAction('toggleTaskList'),
    // Insert menu — horizontal line (StarterKit HorizontalRule extension)
    'horizontal-line': () => runMenuEditorCommand('setHorizontalRule'),
    'page-numbers-header': () => insertPageNumber('header'),
    'page-numbers-footer': () => insertPageNumber('footer'),
    'clear-formatting': () => {
      if (!editor.value) return
      editor.value.chain().unsetAllMarks().clearNodes().run()
      // clearNodes keeps node attributes — also reset text alignment and the
      // block indent when those commands are available.
      runMenuEditorCommand('setTextAlign', 'left')
      runMenuEditorCommand('unsetIndent')
    },
    // Insert menu — editor-scoped inserts (template actions like meeting-notes /
    // email-draft stay host-level and are still emitted).
    'insert-image': () => runPluginMenuAction('insertImage'),
    'insert-table': () => runPluginMenuAction('insertTable', { rows: 3, cols: 3, withHeaderRow: true }),
    // Insert menu — charts (chart plugin, issue #26)
    'insert-chart-bar': () => runPluginMenuAction('insertChart', 'bar'),
    'insert-chart-column': () => runPluginMenuAction('insertChart', 'column'),
    'insert-chart-line': () => runPluginMenuAction('insertChart', 'line'),
    'insert-chart-pie': () => runPluginMenuAction('insertChart', 'pie'),
    'insert-code': () => runPluginMenuAction('toggleCodeBlock'),
    'insert-page-break': () => runPluginMenuAction('insertPageBreak'),
    // Citation plugin command: inserts the derived bibliography block (one per
    // document; the command refuses duplicates).
    'insert-bibliography': () => runPluginMenuAction('insertBibliography'),
    'insert-toc': () => runPluginMenuAction('insertToc'),
    'insert-date-chip': () => runPluginMenuAction('insertDateChip'),
    'insert-people-chip': () => runPluginMenuAction('insertPeopleChip'),
    'insert-file-chip': () => runPluginMenuAction('insertFileChip'),
    'insert-dropdown-chip': () => runPluginMenuAction('insertDropdownChip'),
    'insert-location-chip': () => runPluginMenuAction('insertLocationChip'),
  }

  return {
    editFormatMenuCommands,
  }
}
