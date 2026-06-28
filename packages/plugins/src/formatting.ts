import { definePlugin } from '@kedata-indonesia/docflow-core'
import Underline from '@tiptap/extension-underline'

export const formattingPlugin = definePlugin({
  id: 'formatting',
  tiptapExtensions: [Underline],
  toolbar: [
    { id: 'bold', label: 'Bold', action: 'toggleBold', iconComponent: 'Bold' },
    { id: 'italic', label: 'Italic', action: 'toggleItalic', iconComponent: 'Italic' },
    { id: 'underline', label: 'Underline', action: 'toggleUnderline', iconComponent: 'Underline' },
    { id: 'strike', label: 'Strikethrough', action: 'toggleStrike', iconComponent: 'Strikethrough' },
  ],
})
