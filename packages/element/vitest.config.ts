import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'
import { workspaceAliases } from '../../test/vitest.aliases'
import { coverage } from '../../test/vitest.coverage'

export default defineConfig({
  plugins: [vue()],
  // Workspace packages resolve to src so tests never need a prior build (#40).
  resolve: { alias: workspaceAliases },
  test: {
    environment: 'happy-dom',
    // The element wrapper only has mount/render tests; keep the floor honest and
    // raise it as the suite grows.
    coverage: coverage({ lines: 40, statements: 40, branches: 45, functions: 42 }),
  },
})
