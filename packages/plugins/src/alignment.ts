import { definePlugin } from '@docs-editor/core'
import TextAlign from '@tiptap/extension-text-align'
import type { Editor } from '@tiptap/core'

function setAlign(alignment: 'left' | 'center' | 'right' | 'justify') {
  return (editor: Editor) => editor.commands.setTextAlign(alignment)
}

export const alignmentPlugin = definePlugin({
  id: 'alignment',
  tiptapExtensions: [
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
  ],
  toolbar: [
    { id: 'align-left', label: 'Align Left', action: 'alignLeft', iconComponent: 'AlignLeft' },
    { id: 'align-center', label: 'Align Center', action: 'alignCenter', iconComponent: 'AlignCenter' },
    { id: 'align-right', label: 'Align Right', action: 'alignRight', iconComponent: 'AlignRight' },
    { id: 'align-justify', label: 'Align Justify', action: 'alignJustify', iconComponent: 'AlignJustify' },
  ],
  commands: {
    alignLeft: setAlign('left'),
    alignCenter: setAlign('center'),
    alignRight: setAlign('right'),
    alignJustify: setAlign('justify'),
  },
})
