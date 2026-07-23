import { Extension } from '@tiptap/core'
import type { ImageUploadHandler, CitationPort } from './ports.js'

export interface EditorContextOptions {
  onImageUpload?: ImageUploadHandler
  citation?: CitationPort
}

/**
 * Internal carrier for host-injected ports. Always registered (like TextStyle)
 * so plugin commands can reach the ports through the editor instance:
 *
 *   editor.storage.editorContext.onImageUpload
 *   editor.storage.editorContext.citation
 *
 * Plugins must never import backend concerns — they read injected ports from
 * this storage instead. See docs/LIBRARY_CONTRACT.md.
 */
export const EditorContextExtension = Extension.create<EditorContextOptions>({
  name: 'editorContext',

  addOptions() {
    return {
      onImageUpload: undefined,
      citation: undefined,
    }
  },

  addStorage() {
    return {
      onImageUpload: this.options.onImageUpload,
      citation: this.options.citation,
    }
  },
})
