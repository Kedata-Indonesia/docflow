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
      // Google Docs pastes background-color as an inline span style.
      //
      // This MUST be a *style* rule (no `tag`). A tag rule — `{ tag: 'span',
      // style: 'background-color' }` — is treated as `{ tag: 'span' }` by
      // ProseMirror (a rule with `tag` is a tag rule and `style` is ignored),
      // and since mark rules run before node rules and only the first matching
      // tag rule wins, it swallows EVERY <span>: custom nodes such as
      // `span[data-toc-page]` degrade to highlight-marked text on load (issue
      // #23), and it also loses to TextStyle's own bare span rule anyway.
      //
      // A style rule is applied in addition to the matched tag rule (see
      // DOMParser.readStyles), and only fires for elements that actually carry
      // the inline style — so bare spans and custom span-nodes are left alone.
      // `getAttrs` receives the style VALUE here (not the element), so read the
      // colour straight from it.
      { style: 'background-color', getAttrs: value => ({ color: value as unknown as string }) },
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
