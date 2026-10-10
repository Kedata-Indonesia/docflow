import { defineConfig } from '@playwright/test'

// Showcase e2e: library behaviors exercised against the backend-free demo
// app in this repo (the playground / demo that mounts <DocsEditor>).
// Product flows (auth/collab/sharing) are e2e-tested in the docflow-app repo.
//
// The playground serves on :5200 (see examples/playground/vite.config.ts —
// strictPort, "every doc points at 5200"). Override with DEMO_PORT if the demo
// runs elsewhere.
const demoPort = Number(process.env.DEMO_PORT) || 5200
const demoURL = `http://localhost:${demoPort}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'showcase',
      testDir: './e2e/showcase',
      // The playground has a 300px control rail, so the editor column is narrower
      // than the raw viewport. Give the specs room around the A4 page (the
      // table-resize drags assume margin beyond the paper edge).
      use: { baseURL: demoURL, viewport: { width: 1512, height: 900 } },
    },
  ],
  webServer: [
    {
      // Root `pnpm dev` starts the demo/playground app.
      command: 'pnpm dev',
      url: demoURL,
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
  ],
})
