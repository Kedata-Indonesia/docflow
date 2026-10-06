import { fileURLToPath } from 'node:url'

const srcEntry = (pkg: string): string =>
  fileURLToPath(new URL(`../packages/${pkg}/src/index.ts`, import.meta.url))

/**
 * Resolve first-party workspace packages to their TypeScript sources so tests
 * never depend on a prior `pnpm build` (issue #40).
 *
 * Aliasing *every* workspace package (not just `core`) keeps a single instance
 * of each module in the test graph — mixing `dist/` and `src/` copies would
 * duplicate ProseMirror plugin keys and break identity checks.
 */
export const workspaceAliases: Record<string, string> = {
  '@kedata-indonesia/docflow-core': srcEntry('core'),
  '@kedata-indonesia/docflow-layout-engine': srcEntry('layout-engine'),
  '@kedata-indonesia/docflow-plugins': srcEntry('plugins'),
  '@kedata-indonesia/docflow-vue': srcEntry('vue'),
}
