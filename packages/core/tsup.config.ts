import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  // Bundle tiptap-pagination-plus into core's dist. The package has broken
  // ESM exports (imports without .js extensions, no "type": "module") which
  // cause ERR_MODULE_NOT_FOUND at runtime in Node ESM contexts.
  noExternal: ['tiptap-pagination-plus'],
  external: ['@tiptap/core', '@tiptap/pm', '@tiptap/extension-collaboration',
    '@tiptap/extension-collaboration-cursor', 'prosemirror-state', 'prosemirror-view',
    'prosemirror-model', 'yjs', 'y-websocket', 'y-webrtc', 'y-protocols/awareness'],
})
