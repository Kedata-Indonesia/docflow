#!/usr/bin/env node
/**
 * Pixel-diff two visual-capture directories (issue #215).
 *
 *   node scripts/visual-diff.mjs <beforeDir> <afterDir> [--threshold 0.1] [--ratio 0.0005]
 *
 * Both directories are produced by `pnpm exec playwright test --project=visual` with
 * `VISUAL_OUT` pointing at them. Exit code is 0 when every state is within the allowed
 * ratio, 1 when something moved, 2 on a usage/IO problem — so it can gate a migration
 * branch locally even though it is not wired into CI.
 *
 * Diff images land in `<afterDir>/../diff` so a human can look at exactly what shifted.
 */
import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'

const [beforeDir, afterDir, ...rest] = process.argv.slice(2)
if (!beforeDir || !afterDir) {
  console.error('usage: node scripts/visual-diff.mjs <beforeDir> <afterDir> [--threshold 0.1] [--ratio 0.0005]')
  process.exit(2)
}

const flag = (name, fallback) => {
  const index = rest.indexOf(`--${name}`)
  return index === -1 ? fallback : Number(rest[index + 1])
}
const threshold = flag('threshold', 0.1)
const maxRatio = flag('ratio', 0.0005)
const diffDir = path.join(path.dirname(afterDir), 'diff')

const read = (dir) =>
  fs.existsSync(dir) ? fs.readdirSync(dir).filter((file) => file.endsWith('.png')).sort() : []

const before = read(beforeDir)
const after = read(afterDir)
if (before.length === 0) {
  console.error(`no PNGs in ${beforeDir} — did the capture run with VISUAL_OUT set?`)
  process.exit(2)
}

fs.mkdirSync(diffDir, { recursive: true })

const rows = []
let failed = 0
for (const file of new Set([...before, ...after])) {
  const state = file.replace(/\.png$/, '')
  if (!before.includes(file) || !after.includes(file)) {
    rows.push({ state, status: 'MISSING', ratio: '—', pixels: '—' })
    failed += 1
    continue
  }

  const a = PNG.sync.read(fs.readFileSync(path.join(beforeDir, file)))
  const b = PNG.sync.read(fs.readFileSync(path.join(afterDir, file)))
  if (a.width !== b.width || a.height !== b.height) {
    rows.push({
      state,
      status: `SIZE ${a.width}x${a.height}→${b.width}x${b.height}`,
      ratio: '—',
      pixels: '—',
    })
    failed += 1
    continue
  }

  const diff = new PNG({ width: a.width, height: a.height })
  const pixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold })
  const ratio = pixels / (a.width * a.height)
  if (pixels > 0) {
    fs.writeFileSync(path.join(diffDir, `${state}.png`), PNG.sync.write(diff))
  }
  const ok = ratio <= maxRatio
  if (!ok) failed += 1
  rows.push({
    state,
    status: ok ? (pixels === 0 ? 'identical' : 'within tolerance') : 'CHANGED',
    ratio: (ratio * 100).toFixed(3) + '%',
    pixels: String(pixels),
  })
}

const width = Math.max(...rows.map((row) => row.state.length), 5)
console.log(`${'state'.padEnd(width)}  ${'status'.padEnd(16)}  ${'diff'.padStart(8)}  pixels`)
for (const row of rows) {
  console.log(`${row.state.padEnd(width)}  ${row.status.padEnd(16)}  ${row.ratio.padStart(8)}  ${row.pixels}`)
}

if (failed > 0) {
  console.log(`\n${failed} state(s) outside tolerance (threshold ${threshold}, max ratio ${maxRatio}).`)
  console.log(`Diff images: ${diffDir}`)
  process.exit(1)
}
console.log(`\nall ${rows.length} state(s) within tolerance (threshold ${threshold}, max ratio ${maxRatio}).`)
