import { onMounted, onUnmounted, type Ref } from 'vue'
import { DOMSerializer } from 'prosemirror-model'
import { sanitizePastedHTML, type DocsEditor } from '@kedata-indonesia/docflow-core'
import { writeClipboard, readClipboardHtml, readClipboardText } from './useClipboard.js'

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

  // ─── Clipboard operations (Edit menu) ──────────────────────────────────────
  // Selection is serialized from ProseMirror state (not the DOM), so menu clicks
  // that blurred the editor still cut/copy the right content.

  const serializeSelection = (): { html: string; text: string } | null => {
    if (!editor.value) return null
    const { state } = editor.value
    if (state.selection.empty) return null
    const slice = state.selection.content()
    const div = document.createElement('div')
    div.appendChild(DOMSerializer.fromSchema(state.schema).serializeFragment(slice.content))
    return {
      html: div.innerHTML,
      text: slice.content.textBetween(0, slice.content.size, '\n\n', ' '),
    }
  }

  const handleCut = async () => {
    const sel = serializeSelection()
    if (!sel || !editor.value) return
    const ok = await writeClipboard(sel.text, sel.html)
    if (ok) editor.value.chain().focus().deleteSelection().run()
  }

  const handleCopy = async () => {
    const sel = serializeSelection()
    if (!sel) return
    await writeClipboard(sel.text, sel.html)
    editor.value?.commands.focus()
  }

  const handlePaste = async () => {
    if (!editor.value) return
    // Rich first (keeps formatting); falls back to plain text inside the helper.
    // Sanitize pasted HTML (strip <meta>, <style>, etc.) to prevent crashes
    // from non-content tags commonly produced by Google Docs.
    const html = await readClipboardHtml()
    if (html) {
      const sanitized = sanitizePastedHTML(html)
      try {
        editor.value.chain().focus().insertContent(sanitized).run()
      } catch (err) {
        console.error('[DocsEditor] paste HTML failed, falling back to plain text:', err)
        const text = await readClipboardText()
        if (text) {
          try {
            editor.value.chain().focus().insertContent(text).run()
          } catch (fallbackErr) {
            console.error('[DocsEditor] paste plain text also failed:', fallbackErr)
          }
        }
      }
      return
    }
    const text = await readClipboardText()
    if (text) {
      try {
        editor.value.chain().focus().insertContent(text).run()
      } catch (err) {
        console.error('[DocsEditor] paste plain text failed:', err)
      }
    }
  }

  const handlePastePlain = async () => {
    if (!editor.value) return
    const text = await readClipboardText()
    if (text) editor.value.chain().focus().insertContent(text).run()
  }

  const handleDeleteSelection = () => {
    if (!editor.value) return
    const { state } = editor.value
    if (state.selection.empty) {
      // Google Docs behavior: with no selection, Delete removes the next character.
      const { from, to } = state.selection
      if (to < state.doc.content.size) {
        editor.value.chain().focus().deleteRange({ from, to: to + 1 }).run()
      }
    } else {
      editor.value.chain().focus().deleteSelection().run()
    }
  }

  // ⌘⇧V pastes plain text (native in some browsers; registered here for parity);
  // ⌘⇧H opens find & replace (Google Docs parity).
  const handleEditKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && focusMode.value) {
      focusMode.value = false
      return
    }
    if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return
    if (!editor.value?.view.dom.contains(e.target as Node)) return
    if (e.key.toLowerCase() === 'v') {
      e.preventDefault()
      void handlePastePlain()
    } else if (e.key.toLowerCase() === 'h') {
      e.preventDefault()
      showFindReplace.value = true
    }
  }

  onMounted(() => document.addEventListener('keydown', handleEditKeydown))
  onUnmounted(() => document.removeEventListener('keydown', handleEditKeydown))

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
    // Format menu — align & indent (alignment plugin)
    'align-left': () => runPluginMenuAction('alignLeft'),
    'align-center': () => runPluginMenuAction('alignCenter'),
    'align-right': () => runPluginMenuAction('alignRight'),
    'align-justify': () => runPluginMenuAction('alignJustify'),
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
      // clearNodes keeps node attributes — also reset text alignment when the
      // alignment plugin's command is available.
      runMenuEditorCommand('setTextAlign', 'left')
    },
    // Insert menu — editor-scoped inserts (template actions like meeting-notes /
    // email-draft stay host-level and are still emitted).
    'insert-image': () => runPluginMenuAction('insertImage'),
    'insert-table': () => runPluginMenuAction('insertTable', { rows: 3, cols: 3, withHeaderRow: true }),
    'insert-code': () => runPluginMenuAction('toggleCodeBlock'),
    'insert-page-break': () => runPluginMenuAction('insertPageBreak'),
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
