import { definePlugin } from '@kedata-indonesia/docflow-core'
import Highlight from '@tiptap/extension-highlight'
import { mergeAttributes } from '@tiptap/core'
import type { Editor } from '@tiptap/core'

/**
 * Extended Highlight mark that also parses Google Docs-style background-color:
 *   <span style="background-color: #ffff00">text</span>
 *
 * The default Highlight extension only parses <mark> tags, so pasting from
 * Google Docs would lose background colors.
 */
const GoogleDocsHighlight = Highlight.extend({
  parseHTML() {
    return [
      // Standard <mark> tag (default TipTap behavior)
      { tag: 'mark' },
      // Google Docs pastes background-color as inline span style
      { tag: 'span', style: 'background-color' },
    ]
  },
  renderHTML({ HTMLAttributes }) {
    return ['mark', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
  },
})

export const highlightPlugin = definePlugin({
  id: 'highlight',
  tiptapExtensions: [
    GoogleDocsHighlight.configure({
      multicolor: true,
    }),
  ],
  toolbar: [
    { id: 'highlight', label: 'Highlight', action: 'setHighlight', iconComponent: 'Highlighter' },
  ],
  commands: {
    setHighlight: (editor: Editor, ...args: unknown[]) => {
      const color = args[0] as string | undefined
      if (!color) {
        // Toggle highlight with default yellow
        return editor.chain().focus().toggleHighlight().run()
      }
      if (color === 'default') {
        return editor.chain().focus().unsetHighlight().run()
      }
      return editor.chain().focus().toggleHighlight({ color }).run()
    },
  },
})
