import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { defineConfig } from 'vite'

/**
 * Runtime packages that must stay external (issue #168).
 *
 * Bundling them inlines the whole TipTap/ProseMirror tree, the lucide icon set
 * and the CSL styles into `dist`, which kills consumer tree-shaking and can give
 * the page a second ProseMirror instance. Keep this list in sync with
 * `dependencies` + `peerDependencies` in package.json — `scripts/__tests__/
 * package-externals.test.mjs` fails the build when they diverge.
 */
const external = [
  'vue',
  '@tiptap/core',
  '@kedata-indonesia/docflow-core',
  '@kedata-indonesia/docflow-layout-engine',
  '@kedata-indonesia/docflow-plugins',
  'lucide-vue-next',
  'prosemirror-model',
]

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'DocsEditorVue',
      fileName: (format) => `index.${format === 'es' ? 'js' : 'cjs'}`,
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external,
    },
  },
})
