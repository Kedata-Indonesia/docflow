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
      external: [
        'vue',
        '@kedata-indonesia/docflow-core',
        '@kedata-indonesia/docflow-layout-engine',
        // Keep DocFlow packages as runtime imports. `docflow-plugins` pulls in
        // `citeproc` (CPAL-1.0 OR AGPL-1.0) and the CC-BY-SA-3.0 CSL styles;
        // inlining it here would redistribute copyleft assets inside this
        // Apache-2.0 tarball. It is already a declared dependency, so consumers
        // resolve it from node_modules.
        '@kedata-indonesia/docflow-plugins',
      ],
      output: {
        globals: {
          vue: 'Vue',
          '@kedata-indonesia/docflow-core': 'DocsEditorCore',
          '@kedata-indonesia/docflow-layout-engine': 'DocsEditorLayoutEngine',
          '@kedata-indonesia/docflow-plugins': 'DocsEditorPlugins',
        },
      },
    },
  },
})
