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
    // Restores browser storage globals on Node >= 26 (see test/setup.ts).
    setupFiles: ['../../test/setup.ts'],
    coverage: coverage({ lines: 82, statements: 82, branches: 75, functions: 50 }),
  },
})
