import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

const apiBaseUrl = process.env.VITE_API_BASE_URL;
const port = Number(process.env.DEMO_PORT) || 5173;

export default defineConfig({
  plugins: [vue()],
  server: {
    port,
    proxy: apiBaseUrl
      ? undefined
      : {
          // Better Auth + all API routes live under /api/*. Do NOT proxy bare
          // /auth/* — those are frontend SPA routes (e.g. the OAuth
          // newUser/error callback targets); proxying them to the backend 404s.
          '/api': {
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
