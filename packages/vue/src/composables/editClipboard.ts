import type { Ref } from 'vue'
import { DOMSerializer } from 'prosemirror-model'
import { sanitizePastedHTML, type DocsEditor } from '@kedata-indonesia/docflow-core'
import {
  writeClipboard,
  readClipboardHtml,
  readClipboardText,
  readClipboardImage,
} from './useClipboard.js'
import { insertPastedImage } from './pasteImage.js'

export interface UseEditClipboardOptions {
  editor: Ref<DocsEditor['editor'] | null>
}

/**
 * Clipboard operations for the Edit menu (cut/copy/paste/paste-plain/delete).
 *
 * Selection is serialized from ProseMirror state (not the DOM), so menu clicks
 * that blurred the editor still cut/copy the right content.
 */
export function useEditClipboard({ editor }: UseEditClipboardOptions) {
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

  return {
    handleCut,
    handleCopy,
    handlePaste,
    handlePastePlain,
    handleDeleteSelection,
  }
}
