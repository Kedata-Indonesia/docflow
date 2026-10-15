import { definePlugin, FontFamilyExtension } from '@kedata-indonesia/docflow-core'
import type { Editor } from '@tiptap/core'

/**
 * fontFamilyPlugin — provides the `setFontFamily` command action for toolbar
 * use, backed by FontFamilyExtension (a `fontFamily` attribute on the TextStyle
 * mark). Registered through the plugin system so the extension is added once.
 *
 * The toolbar passes a full CSS font stack (e.g. `Georgia, serif`) so the
 * applied family is explicit and survives round-trips.
 */
export const fontFamilyPlugin = definePlugin({
  id: 'font-family',
  tiptapExtensions: [FontFamilyExtension],
  commands: {
    setFontFamily: (editor: Editor, ...args: unknown[]) => {
      const family = (args[0] as string) || ''
      if (family) {
        editor.commands.setFontFamily(family)
      } else {
        editor.commands.unsetFontFamily()
      }
      editor.commands.focus()
      return true
    },
  },
})

// Re-export for external consumers.
export { FontFamilyExtension }
