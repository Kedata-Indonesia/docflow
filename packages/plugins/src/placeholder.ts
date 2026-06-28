import { definePlugin } from '@docs-editor/core'
import Placeholder from '@tiptap/extension-placeholder'

export interface PlaceholderPluginOptions {
  placeholder?: string
}

export function createPlaceholderPlugin(options: PlaceholderPluginOptions = {}) {
  return definePlugin({
    id: 'placeholder',
    tiptapExtensions: [
      Placeholder.configure({
        placeholder: options.placeholder ?? 'Start writing…',
      }),
    ],
  })
}

export const placeholderPlugin = createPlaceholderPlugin()
