import base from '../../packages/vue/tailwind.config.js'

/**
 * Only needed for `PLAYGROUND_SOURCE=1`: in that mode the library is rendered
 * straight from `packages/vue/src`, so Tailwind has to scan the library source
 * with the same theme tokens the library ships.
 *
 * The default (dist) mode loads `dist/style.css`, which is already compiled and
 * needs no Tailwind configuration at all.
 */
export default {
  presets: [base],
  content: ['./index.html', './src/**/*.{vue,ts}', '../../packages/vue/src/**/*.{vue,ts}'],
}
