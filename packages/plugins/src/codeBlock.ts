import { definePlugin } from '@docs-editor/core'

export const codeBlockPlugin = definePlugin({
  id: 'code-block',
  toolbar: [{ id: 'code-block', label: 'Code Block', action: 'toggleCodeBlock', iconComponent: 'Code' }],
  slashCommands: [{ name: 'Code Block', command: 'toggleCodeBlock' }],
})
