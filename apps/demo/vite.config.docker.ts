import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Docker build config — no source aliases, uses hoisted pnpm node_modules.
// Workspace packages are pre-built, so Vite resolves them via node_modules.
const port = Number(process.env.DEMO_PORT) || 5173;

export default defineConfig({
  plugins: [vue()],
  server: {
    port,
  },
  resolve: {
    dedupe: ['vue', 'yjs'],
  },
});
