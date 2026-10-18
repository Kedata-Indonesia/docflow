import { defineConfig } from 'vitest/config'
import { workspaceAliases } from '../../test/vitest.aliases'
import { coverage } from '../../test/vitest.coverage'

export default defineConfig({
  // Workspace packages resolve to src so tests never need a prior build (#40).
  resolve: { alias: workspaceAliases },
  test: {
    environment: 'happy-dom',
    coverage: coverage({ lines: 83, statements: 83, branches: 72, functions: 72 }),
  },
})
