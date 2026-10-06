import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'
import { workspaceAliases } from '../../test/vitest.aliases'

export default defineConfig({
  plugins: [vue()],
  // Workspace packages resolve to src so tests never need a prior build (#40).
  resolve: { alias: workspaceAliases },
  test: {
    environment: 'happy-dom',
  },
})
