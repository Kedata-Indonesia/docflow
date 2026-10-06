import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    // Restores browser storage globals on Node >= 26 (see test/setup.ts).
    setupFiles: ['../../test/setup.ts'],
  },
})
