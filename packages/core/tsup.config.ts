import { defineConfig } from 'tsup'

export default defineConfig({
  // Three entries: the full barrel (index), the yjs-free AI surface (ai),
  // and the opt-in collaboration subpath (collab). Server-side consumers must
  // import from './ai' — the barrel eagerly pulls the client collab stack
  // (y-webrtc/y-indexeddb/y-websocket → ESM yjs), which dual-instantiates yjs
  // next to the server's vendored CJS y-websocket. 'collab' exists for hosts
  // that DO want subdocument sync helpers — since issue fe-aktifai#230 the
  // barrel itself is lazy-safe (createCollaboration dynamic-imports providers),
  // but SubdocumentProvider is a synchronous class and still lives here.
  entry: ['src/index.ts', 'src/ai/index.ts', 'src/collab/index.ts'],
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
