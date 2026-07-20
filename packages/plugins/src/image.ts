import { definePlugin, type ImageUploadHandler } from '@kedata-indonesia/docflow-core'
import Image from '@tiptap/extension-image'
import type { Editor } from '@tiptap/core'

interface EditorContextStorage {
  onImageUpload?: ImageUploadHandler
}

/**
 * Open a hidden file picker and resolve with the chosen file (null on cancel).
 * Note: `cancel` is not fired by every browser — a dismissed picker may simply
 * never resolve, which is harmless (no state is touched until a file arrives).
 */
function pickImageFile(): Promise<File | null> {
  if (typeof document === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    const cleanup = () => input.remove()
    input.onchange = () => {
      const file = input.files?.[0] ?? null
      cleanup()
      resolve(file)
    }
    input.oncancel = () => {
      cleanup()
      resolve(null)
    }
    document.body.appendChild(input)
    input.click()
  })
}

export const imagePlugin = definePlugin({
  id: 'image',
  tiptapExtensions: [Image],
  toolbar: [{ id: 'insert-image', label: 'Image', action: 'insertImage', iconComponent: 'Image' }],
  slashCommands: [{ name: 'Image', command: 'insertImage' }],
  commands: {
    insertImage: (editor: Editor, ...args: unknown[]) => {
      const options = args[0] as { src?: string; alt?: string; title?: string } | undefined

      // Programmatic path — unchanged and fully synchronous.
      if (options?.src) {
        return editor.commands.setImage({ src: options.src, alt: options.alt, title: options.title })
      }

      // Host-injected upload port: pick a file, upload via the host, insert on
      // resolve. The command returns true immediately; insertion happens inside
      // the promise (the plugin command contract stays synchronous).
      const context = (editor.storage as Record<string, unknown>).editorContext as EditorContextStorage | undefined
      const upload = context?.onImageUpload
      if (upload) {
        void pickImageFile().then(async (file) => {
          if (!file) return
          try {
            const result = await upload(file)
            if (result?.src) {
              editor.commands.setImage({ src: result.src, alt: result.alt, title: result.title })
            }
          } catch (err) {
            console.error('[image] upload failed:', err)
          }
        })
        return true
      }

      // No upload port — URL prompt fallback. The library never names a host.
      if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
        const src = window.prompt('Enter image URL:', 'https://')
        if (!src) return false
        return editor.commands.setImage({ src })
      }
      return false
    },
  },
})
