import { Mark, mergeAttributes } from '@tiptap/core'
import { definePlugin } from '@kedata-indonesia/docflow-core'
import type { Editor } from '@tiptap/core'

export const FontSizeMark = Mark.create({
  name: 'fontSize',

  addAttributes() {
    return {
      size: {
        default: null,
        parseHTML: el => el.style.fontSize?.replace('px', '') ? `${el.style.fontSize}` : null,
        renderHTML: attrs => {
          if (!attrs.size) return {}
          return { style: `font-size: ${attrs.size}` }
        },
      },
    }
  },

  parseHTML() {
    return [{ style: 'font-size' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'docs-font-size' }), 0]
  },

  addCommands() {
    return {
      setFontSize: (size: string) => ({ commands }) => {
        if (size === '16px' || size === '16') {
          return commands.unsetMark('fontSize')
        }
        return commands.setMark('fontSize', { size })
      },
      unsetFontSize: () => ({ commands }) => commands.unsetMark('fontSize'),
    }
  },
})

export const fontSizePlugin = definePlugin({
  id: 'font-size',
  tiptapExtensions: [FontSizeMark],
  commands: {
    setFontSize: (editor: Editor, ...args: unknown[]) => {
      const size = (args[0] as string) || '16px'
      if (size === '16px') {
        return editor.chain().focus().unsetFontSize().run()
      }
      return editor.chain().focus().setFontSize(size).run()
    },
  },
})
