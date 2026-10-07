import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

/**
 * Default mode consumes the library through its published entry points — the
 * exact path a consumer takes (requires `pnpm build` first).
 *
 * `PLAYGROUND_SOURCE=1` aliases every workspace package — and the library
 * stylesheet — to the package sources under `packages/<pkg>/src`, so edits
 * inside the packages hot-reload without a prior build.
 */
const fromSource = process.env.PLAYGROUND_SOURCE === '1'

const sourceFile = (relativePath: string): string =>
  fileURLToPath(new URL(`../../packages/${relativePath}`, import.meta.url))

/** Kept in sync with the publishable packages in `pnpm-workspace.yaml`. */
const SOURCE_PACKAGES = ['core', 'layout-engine', 'plugins', 'vue', 'element', 'export']

// The packages import each other by bare name (`@kedata-indonesia/docflow-core`),
// so every one of them has to be aliased — aliasing only `vue` would silently
// fall back to `dist/` for the rest.
const sourceAliases = [
  ...SOURCE_PACKAGES.map((pkg) => ({
    find: new RegExp(`^@kedata-indonesia/docflow-${pkg}$`),
    replacement: sourceFile(`${pkg}/src/index.ts`),
  })),
  // `style.css` is a build artifact; in source mode the stylesheet is the raw
  // Tailwind entry, compiled by this app's postcss/tailwind config.
  {
    find: /^@kedata-indonesia\/docflow-vue\/style\.css$/,
    replacement: sourceFile('vue/src/styles/index.css'),
  },
]

export default defineConfig({
  plugins: [vue()],
  resolve: fromSource ? { alias: sourceAliases } : {},
  server: {
    port: 5200,
    // Fail loudly instead of drifting to another port: every doc points at 5200.
    strictPort: true,
  },
})
