import { defineConfig } from 'vitest/config'
import { workspaceAliases } from '../../test/vitest.aliases'
import { coverage } from '../../test/vitest.coverage'

export default defineConfig({
  // Workspace packages resolve to src so tests never need a prior build (#40).
  resolve: { alias: workspaceAliases },
  test: {
    environment: 'happy-dom',
    coverage: coverage({ lines: 82, statements: 82, branches: 70, functions: 75 }),
  },
})
