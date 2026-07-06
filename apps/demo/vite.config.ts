import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

const apiBaseUrl = process.env.VITE_API_BASE_URL;

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: apiBaseUrl
      ? undefined
      : {
          '/api': {
            target: 'http://localhost:3001',
            changeOrigin: true,
          },
          '/auth': {
            target: 'http://localhost:3001',
            changeOrigin: true,
          },
        },
  },
  resolve: {
    dedupe: ['vue', 'yjs'],
    alias: {
      '@kedata-indonesia/docflow-vue/style.css': path.resolve(__dirname, '../../packages/vue/src/styles/index.css'),
      '@kedata-indonesia/docflow-vue': path.resolve(__dirname, '../../packages/vue/src/index.ts'),
      '@kedata-indonesia/docflow-core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
      '@kedata-indonesia/docflow-layout-engine': path.resolve(__dirname, '../../packages/layout-engine/src/index.ts'),
      '@kedata-indonesia/docflow-plugins': path.resolve(__dirname, '../../packages/plugins/src/index.ts'),
    },
  },
});
