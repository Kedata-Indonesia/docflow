import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { defineConfig } from 'vite'

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
      external: ['vue', '@docs-editor/core', '@docs-editor/layout-engine'],
      output: {
        globals: {
          vue: 'Vue',
          '@docs-editor/core': 'DocsEditorCore',
          '@docs-editor/layout-engine': 'DocsEditorLayoutEngine',
        },
      },
    },
  },
})
