import { Extension } from '@tiptap/core'
import type { ImageUploadHandler } from './ports.js'

export interface EditorContextOptions {
  onImageUpload?: ImageUploadHandler
}

/**
 * Internal carrier for host-injected ports. Always registered (like TextStyle)
 * so plugin commands can reach the ports through the editor instance:
 *
 *   editor.storage.editorContext.onImageUpload
 *
 * Plugins must never import backend concerns — they read injected ports from
 * this storage instead. See docs/LIBRARY_CONTRACT.md.
 */
export const EditorContextExtension = Extension.create<EditorContextOptions>({
  name: 'editorContext',

  addOptions() {
    return {
      onImageUpload: undefined,
    }
  },

  addStorage() {
    return {
      onImageUpload: this.options.onImageUpload,
    }
  },
})
