import { definePlugin } from '@kedata-indonesia/docflow-core'
import Color from '@tiptap/extension-color'
import type { Editor } from '@tiptap/core'

export const textColorPlugin = definePlugin({
  id: 'text-color',
  tiptapExtensions: [Color],
  toolbar: [
    { id: 'text-color', label: 'Text Color', action: 'setTextColor', iconComponent: 'Palette' },
  ],
  commands: {
    setTextColor: (editor: Editor, ...args: unknown[]) => {
      const color = args[0] as string | undefined
      if (!color) return false
      if (color === 'default') {
        return editor.chain().focus().unsetColor().run()
      }
      return editor.chain().focus().setColor(color).run()
    },
  },
})
