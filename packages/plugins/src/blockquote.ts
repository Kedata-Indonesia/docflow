import { definePlugin } from '@docs-editor/core'

export const blockquotePlugin = definePlugin({
  id: 'blockquote',
  toolbar: [{ id: 'blockquote', label: 'Blockquote', action: 'toggleBlockquote', iconComponent: 'Quote' }],
  slashCommands: [{ name: 'Blockquote', command: 'toggleBlockquote' }],
})
