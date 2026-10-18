import { defineConfig } from 'vitest/config'
import { coverage } from '../../test/vitest.coverage'

export default defineConfig({
  test: {
    coverage: coverage({ lines: 66, statements: 66, branches: 60, functions: 76 }),
  },
})
