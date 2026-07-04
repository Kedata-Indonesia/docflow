import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Docker build config — no source aliases, uses hoisted pnpm node_modules.
// Workspace packages are pre-built, so Vite resolves them via node_modules.
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
  },
  resolve: {
    dedupe: ['vue', 'yjs'],
  },
});
