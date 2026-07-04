import { definePlugin } from '@kedata-indonesia/docflow-core'
import { Extension } from '@tiptap/core'
import type { Editor } from '@tiptap/core'

const FONT_SIZES = [
  { label: '10px', value: '10px' },
  { label: '12px', value: '12px' },
  { label: '14px', value: '14px' },
  { label: '16px', value: '16px' },
  { label: '18px', value: '18px' },
  { label: '20px', value: '20px' },
  { label: '24px', value: '24px' },
  { label: '30px', value: '30px' },
  { label: '36px', value: '36px' },
]

export const FontSizeExtension = Extension.create({
  name: 'fontSize',

  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: el => el.style.fontSize || null,
            renderHTML: attrs => {
              if (!attrs.fontSize) return {}
              return { style: `font-size: ${attrs.fontSize}` }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setFontSize: (fontSize: string) => ({ chain }) => {
        return chain()
          .setMark('textStyle', { fontSize })
          .run()
      },
      unsetFontSize: () => ({ chain }) => {
        return chain()
          .setMark('textStyle', { fontSize: null })
          .removeEmptyTextStyle()
          .run()
      },
    } as Record<string, (fontSize: string) => ReturnType<ReturnType<Editor['commands']['chain']>['run']>>
  },
})

export const fontSizePlugin = definePlugin({
  id: 'font-size',
  tiptapExtensions: [FontSizeExtension],
  toolbar: [
    { id: 'font-size', label: 'Font Size', action: 'setFontSize', iconComponent: 'Type' },
  ],
  commands: {
    setFontSize: (editor: Editor, ...args: unknown[]) => {
      const size = (args[0] as string) || '16px'
      return editor.chain().focus().setMark('textStyle', { fontSize: size }).run()
    },
  },
})
