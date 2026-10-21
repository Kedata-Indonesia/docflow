import vue from '@vitejs/plugin-vue'
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'path'
import { defineConfig } from 'vite'

/**
 * Runtime packages that must stay external (issue #168).
 *
 * Bundling them inlines the whole TipTap/ProseMirror tree, the lucide icon set
 * and the CSL styles into `dist`, which kills consumer tree-shaking and can give
 * the page a second ProseMirror instance. Keep this list in sync with
 * `dependencies` + `peerDependencies` in package.json — `scripts/__tests__/
 * package-externals.test.mjs` fails the build when they diverge.
 */
const external = [
  'vue',
  '@tiptap/core',
  '@kedata-indonesia/docflow-core',
  '@kedata-indonesia/docflow-layout-engine',
  '@kedata-indonesia/docflow-plugins',
  'lucide-vue-next',
  'prosemirror-model',
]

export default defineConfig({
  plugins: [
    vue(),
    {
      // KaTeX's stylesheet is imported through PostCSS, which inlines it without
      // rebasing the `url(fonts/…)` references. Ship the font files next to
      // style.css so consumers (and the app's Vite build) resolve them.
      name: 'docflow-katex-fonts',
      apply: 'build',
      generateBundle() {
        const require = createRequire(import.meta.url)
        const fontsDir = resolve(dirname(require.resolve('katex/dist/katex.min.css')), 'fonts')
        for (const file of readdirSync(fontsDir)) {
          this.emitFile({
            type: 'asset',
            fileName: `fonts/${file}`,
            source: readFileSync(resolve(fontsDir, file)),
          })
        }
      },
    },
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'DocsEditorVue',
      fileName: (format) => `index.${format === 'es' ? 'js' : 'cjs'}`,
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external,
    },
  },
})
