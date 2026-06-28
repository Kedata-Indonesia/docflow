import { definePlugin } from '@docs-editor/core'
import Image from '@tiptap/extension-image'
import type { Editor } from '@tiptap/core'

const DEFAULT_IMAGE_SRC = 'https://via.placeholder.com/300x200'

export const imagePlugin = definePlugin({
  id: 'image',
  tiptapExtensions: [Image],
  toolbar: [{ id: 'insert-image', label: 'Image', action: 'insertImage', iconComponent: 'Image' }],
  slashCommands: [{ name: 'Image', command: 'insertImage' }],
  commands: {
    insertImage: (editor: Editor, ...args: unknown[]) => {
      const options = args[0] as { src?: string } | undefined
      const src =
        options?.src ??
        (typeof window !== 'undefined' && typeof window.prompt === 'function'
          ? window.prompt('Enter image URL:', 'https://')
          : null) ??
        DEFAULT_IMAGE_SRC
      if (!src) return false
      return editor.commands.setImage({ src })
    },
  },
})
