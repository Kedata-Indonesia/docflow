import { ref, type Ref } from 'vue'
import type { DocsEditor } from '@kedata-indonesia/docflow-core'

export interface UseLinkDialogOptions {
  editor: Ref<DocsEditor['editor'] | null>
}

/**
 * Insert / edit-link dialog state + commands. The three commands only touch
 * the editor's link mark — the ProseMirror document stays the single source of
 * truth. Extracted verbatim from DocsEditor.
 */
export function useLinkDialog(options: UseLinkDialogOptions) {
  const { editor } = options

  const showLinkDialog = ref(false)
  const linkDialogInitialText = ref('')
  const linkDialogInitialUrl = ref('')
  const linkDialogIsEditing = ref(false)

  function openLinkDialog() {
    if (!editor.value) return
    const { state } = editor.value
    const { from, to, empty } = state.selection
    const attrs = editor.value.getAttributes('link')

    if (attrs.href) {
      linkDialogIsEditing.value = true
      linkDialogInitialUrl.value = attrs.href
      if (!empty) {
        linkDialogInitialText.value = state.doc.textBetween(from, to, ' ')
      } else {
        linkDialogInitialText.value = ''
      }
    } else {
      linkDialogIsEditing.value = false
      linkDialogInitialUrl.value = 'https://'
      linkDialogInitialText.value = empty ? '' : state.doc.textBetween(from, to, ' ')
    }

    showLinkDialog.value = true
  }

  function applyLinkDialog(payload: { text: string; url: string }) {
    if (!editor.value) return
    const { state } = editor.value
    const { from, to, empty } = state.selection
    const displayText = payload.text.trim()

    const chain = editor.value.chain().focus() as unknown as {
      setLink: (attrs: { href: string; target: string }) => { run: () => boolean }
      unsetLink: () => { run: () => boolean }
      insertContentAt: (range: { from: number; to: number }, content: unknown) => { run: () => boolean }
      insertContent: (content: unknown) => { run: () => boolean }
    }

    if (linkDialogIsEditing.value || editor.value.isActive('link')) {
      // Update existing link
      chain.setLink({ href: payload.url, target: '_blank' }).run()
      if (displayText && !empty) {
        chain.insertContentAt({ from, to }, displayText).run()
      }
    } else if (displayText) {
      // Replace selection with linked text
      chain.insertContentAt({ from, to }, {
        type: 'text',
        text: displayText,
        marks: [{ type: 'link', attrs: { href: payload.url, target: '_blank' } }],
      }).run()
    } else if (!empty) {
      // Apply link to current selection
      chain.setLink({ href: payload.url, target: '_blank' }).run()
    } else {
      // Insert link with URL as text
      chain.insertContent({
        type: 'text',
        text: payload.url,
        marks: [{ type: 'link', attrs: { href: payload.url, target: '_blank' } }],
      }).run()
    }

    showLinkDialog.value = false
  }

  function removeLink() {
    if (!editor.value) return
    const chain = editor.value.chain().focus() as unknown as { unsetLink: () => { run: () => boolean } }
    chain.unsetLink().run()
    showLinkDialog.value = false
  }

  return {
    showLinkDialog,
    linkDialogInitialText,
    linkDialogInitialUrl,
    linkDialogIsEditing,
    openLinkDialog,
    applyLinkDialog,
    removeLink,
  }
}
