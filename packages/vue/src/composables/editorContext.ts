/**
 * Typed, `any`-free access to `editor.storage.editorContext`.
 *
 * The host-owned AI ports live on the `editorContext` extension storage, but
 * `docflow-vue` only knows their structural shape (the same reason plugins read
 * them through a cast). Centralising the cast here keeps the rest of the
 * package free of `as any` while staying resilient when the extension is
 * absent.
 */
import type { Editor } from '@tiptap/core'
import type { AIDraftFn, AIStreamFn } from '@kedata-indonesia/docflow-core'

/** Shape of the host-injected AI ports kept on `editor.storage.editorContext`. */
export interface EditorContextStorage {
  aiStream?: AIStreamFn
  aiDraft?: AIDraftFn
}

/**
 * Reads `editor.storage.editorContext`. Returns `undefined` when the editor is
 * absent or the context extension was not registered.
 */
export function readEditorContext(editor: Editor | null): EditorContextStorage | undefined {
  return (editor?.storage as unknown as { editorContext?: EditorContextStorage } | undefined)
    ?.editorContext
}
