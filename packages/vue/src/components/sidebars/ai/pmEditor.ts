import { toRaw } from 'vue'
import type { Editor } from '@tiptap/core'

/**
 * ProseMirror internals must never go through Vue's deep reactivity: a proxied
 * Editor yields proxied node/mark TYPES, breaking identity checks (doc.eq →
 * "Applying a mismatched transaction" on dispatch).
 */
export function toRawEditor(editor: Editor | null | undefined): Editor | null {
  return editor ? toRaw(editor) : null
}
