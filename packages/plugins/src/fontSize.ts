import { definePlugin, FontSizeExtension } from '@kedata-indonesia/docflow-core'
import type { Editor } from '@tiptap/core'

/**
 * fontSizePlugin — provides the `setFontSize` command action for toolbar use.
 *
 * Registers FontSizeExtension (fontSize attribute on TextStyle mark) via
 * tiptapExtensions so it is only added ONCE through the plugin system.
 * Previously it was hardcoded in Editor.ts which, combined with Vite
 * module alias duplication, caused "Duplicate extension names" warnings.
 */
export const fontSizePlugin = definePlugin({
  id: 'font-size',
  tiptapExtensions: [FontSizeExtension],
  commands: {
    setFontSize: (editor: Editor, ...args: unknown[]) => {
      const size = (args[0] as string) || '16px'
      if (size === '16px') {
        editor.commands.unsetFontSize()
      } else {
        editor.commands.setFontSize(size)
      }
      editor.commands.focus()
      return true
    },
  },
})

// Re-export for external consumers.
export { FontSizeExtension }
