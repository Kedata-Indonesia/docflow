import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
  },
  resolve: {
    dedupe: ['vue', 'yjs'],
    alias: {
      '@docs-editor/vue': path.resolve(__dirname, '../../packages/vue/src/index.ts'),
      '@docs-editor/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
      '@docs-editor/layout-engine': path.resolve(__dirname, '../../packages/layout-engine/src/index.ts'),
    },
  },
});
