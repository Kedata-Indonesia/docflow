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
      external: ['vue', '@kedata-indonesia/docflow-core', '@kedata-indonesia/docflow-layout-engine'],
      output: {
        globals: {
          vue: 'Vue',
          '@kedata-indonesia/docflow-core': 'DocsEditorCore',
          '@kedata-indonesia/docflow-layout-engine': 'DocsEditorLayoutEngine',
        },
      },
    },
  },
})
