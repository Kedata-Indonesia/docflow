import { defineConfig } from 'vitest/config'
import { workspaceAliases } from '../../test/vitest.aliases'

export default defineConfig({
  // Workspace packages resolve to src so tests never need a prior build (#40).
  resolve: { alias: workspaceAliases },
  test: {
    environment: 'happy-dom',
  },
})
