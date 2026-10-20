import { onMounted, onUnmounted, type Ref } from 'vue'
import { DOMSerializer } from 'prosemirror-model'
import { sanitizePastedHTML, type DocsEditor } from '@kedata-indonesia/docflow-core'
import { writeClipboard, readClipboardHtml, readClipboardText, readClipboardImage } from './useClipboard.js'
import { insertPastedImage, pickImageFile } from './pasteImage.js'

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

/**
 * The keys of `editFormatMenuCommands`, exported so menu classification
 * (issue #153, `components/menuActions.ts`) can subtract them from the
 * host-owned set without duplicating the map. `menuActions.drift.test.ts`
 * asserts this list and the real map never diverge.
 */
export const EDIT_FORMAT_MENU_ACTIONS: readonly string[] = [
  // Edit menu
  'undo',
  'redo',
  'select-all',
  'cut',
  'copy',
  'paste',
  'paste-without-formatting',
  'delete',
  // Format menu — text styles
  'bold',
  'italic',
  'underline',
  'heading1',
  'heading2',
  'heading3',
  // Format menu — align & indent
  'align-left',
  'align-center',
  'align-right',
  'align-justify',
  'indent',
  'outdent',
  // Format menu — bullets & numbering
  'bullet-list',
  'numbered-list',
  'task-list',
  // Insert menu — editor-scoped inserts
  'horizontal-line',
  'page-numbers-header',
  'page-numbers-footer',
  'clear-formatting',
  'insert-image',
  'insert-table',
  'insert-code',
  'insert-page-break',
  'insert-bibliography',
  'insert-toc',
  'insert-date-chip',
  'insert-people-chip',
  'insert-file-chip',
  'insert-dropdown-chip',
  'insert-location-chip',
]

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

  /** Insert the clipboard image through the shared upload/data-URL path. */
  const pasteClipboardImage = async (): Promise<boolean> => {
    const current = editor.value
    if (!current) return false
    const image = await readClipboardImage()
    if (!image) return false
    return insertPastedImage(current, image)
  }

  const handlePaste = async () => {
    if (!editor.value) return
    // Rich text first (keeps formatting); a browser-copied image usually ships
    // an `<img>` in text/html, which the upload/insert path must not replace.
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
    // Image-only clipboard (screenshot / “Copy image” without text/html).
    if (await pasteClipboardImage()) return
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
    if (text) {
      editor.value.chain().focus().insertContent(text).run()
      return
    }
    // “Paste without formatting” still has to handle an image-only clipboard.
    await pasteClipboardImage()
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

  // Ctrl/Cmd+V on an image-only clipboard would otherwise fall through to
  // ProseMirror's text/HTML paste path (and insert nothing). Capture on the
  // document so this runs before ProseMirror's own listener on the editor; leave
  // rich HTML alone so pasting a browser image keeps its surrounding markup.
  const handleNativePaste = (event: ClipboardEvent) => {
    const current = editor.value
    if (!current) return
    const target = event.target
    if (!(target instanceof Node) || !current.view.dom.contains(target)) return
    const data = event.clipboardData
    if (!data || Array.from(data.types).includes('text/html')) return
    const file = pickImageFile(data)
    if (!file) return
    event.preventDefault()
    event.stopPropagation()
    void insertPastedImage(current, file)
  }

  onMounted(() => {
    document.addEventListener('keydown', handleEditKeydown)
    document.addEventListener('paste', handleNativePaste, true)
  })
  onUnmounted(() => {
    document.removeEventListener('keydown', handleEditKeydown)
    document.removeEventListener('paste', handleNativePaste, true)
  })

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
