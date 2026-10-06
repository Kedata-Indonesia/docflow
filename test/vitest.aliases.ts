import { fileURLToPath } from 'node:url'

const src = (path: string): string =>
  fileURLToPath(new URL(`../packages/${path}`, import.meta.url))

/** Exact-match alias — a plain string key would also match subpath imports. */
const pkg = (name: string): { find: RegExp; replacement: string } => ({
  find: new RegExp(`^@kedata-indonesia/docflow-${name}$`),
  replacement: src(`${name}/src/index.ts`),
})

/**
 * Resolve first-party workspace packages to their TypeScript sources so tests
 * never depend on a prior `pnpm build` (issue #40).
 *
 * Regex entries keep the match exact: a plain string alias key is a *prefix*
 * match in Vite/Rollup, so `@kedata-indonesia/docflow-core` would also rewrite
 * the subpath `@kedata-indonesia/docflow-core/ai` into `.../src/index.ts/ai`.
 * The public subpaths (see each package's `exports`) are listed explicitly.
 *
 * Aliasing every workspace package (not just `core`) keeps a single instance
 * of each module in the test graph — mixing `dist/` and `src/` copies would
 * duplicate ProseMirror plugin keys and break identity checks.
 */
export const workspaceAliases: Array<{ find: RegExp; replacement: string }> = [
  pkg('core'),
  pkg('layout-engine'),
  pkg('plugins'),
  pkg('vue'),
  pkg('element'),
  { find: /^@kedata-indonesia\/docflow-core\/ai$/, replacement: src('core/src/ai/index.ts') },
  { find: /^@kedata-indonesia\/docflow-plugins\/citations$/, replacement: src('plugins/src/citations.ts') },
  { find: /^@kedata-indonesia\/docflow-vue\/style\.css$/, replacement: src('vue/src/styles/index.css') },
]
