import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    // Restores browser storage globals on Node >= 26 (see test/setup.ts).
    setupFiles: ['../../test/setup.ts'],
  },
})
