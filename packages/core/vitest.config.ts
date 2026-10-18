import { defineConfig } from 'vitest/config'
import { coverage } from '../../test/vitest.coverage'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    // Restores browser storage globals on Node >= 26 (see test/setup.ts).
    setupFiles: ['../../test/setup.ts'],
    coverage: coverage({ lines: 65, statements: 65, branches: 72, functions: 85 }),
  },
})
