import { definePlugin } from '@kedata-indonesia/docflow-core'
import Link from '@tiptap/extension-link'
import type { Editor } from '@tiptap/core'

export const linkPlugin = definePlugin({
  id: 'link',
  tiptapExtensions: [Link.configure({ openOnClick: false })],
  toolbar: [
    { id: 'set-link', label: 'Link', action: 'setLink', iconComponent: 'Link' },
  ],
  slashCommands: [{ name: 'Link', command: 'setLink' }],
  commands: {
    setLink: (editor: Editor, ...args: unknown[]) => {
      if (editor.isActive('link')) {
        return editor.chain().focus().unsetLink().run()
      }
      const attrs = args[0] as { href?: string } | undefined
      const url =
        attrs?.href ??
        (typeof window !== 'undefined' && typeof window.prompt === 'function'
          ? window.prompt('Enter link URL:', 'https://')
          : null)
      if (url) {
        return editor.chain().focus().setLink({ href: url, target: '_blank' }).run()
      }
      return false
    },
  },
})
