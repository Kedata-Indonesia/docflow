import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { test } from 'node:test'

const ROOT = process.cwd()
const PACKAGES_DIR = join(ROOT, 'packages')

// The five strings extracted in #176 must only live in
// packages/vue/src/styles/classes.ts.
const CENTRALIZED = [
  'mb-1 block text-[10px] font-semibold text-slate-500 dark:text-slate-400',
  'w-full rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-2 text-xs dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-200',
  'mx-1 h-5 w-px flex-shrink-0 bg-slate-200 dark:bg-white/10',
  'w-full rounded-md border border-slate-200 bg-transparent px-3 py-1.5 text-xs focus:outline-none dark:border-slate-700',
  'flex items-center gap-3 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300 select-none',
]

// Post-#176 baseline. The issue's ideal <20 needs a larger pass over the
// remaining 5x/4x patterns; this ratchet keeps the top five from returning
// and stops the total from growing while that follow-up is pending.
const MAX_DISTINCT_DUPLICATED = 54

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === 'dist') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.isFile() && entry.name.endsWith('.vue') && !/\.(spec|test)\./.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

function scan() {
  const files = []
  for (const pkg of readdirSync(PACKAGES_DIR)) {
    const src = join(PACKAGES_DIR, pkg, 'src')
    try {
      if (statSync(src).isDirectory()) walk(src, files)
    } catch {
      // package without a src directory
    }
  }

  const staticClass = /(?<![:-\w])class\s*=\s*["']([^"']{40,})["']/g
  const values = new Map()

  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n')
    for (let i = 0; i < lines.length; i += 1) {
      staticClass.lastIndex = 0
      let match
      while ((match = staticClass.exec(lines[i]))) {
        const value = match[1]
        const locations = values.get(value) ?? []
        locations.push(`${relative(ROOT, file)}:${i + 1}`)
        values.set(value, locations)
      }
    }
  }

  const duplicated = [...values.entries()].filter(([, locations]) => locations.length > 1)
  return { files, values, duplicated }
}

const { files, values, duplicated } = scan()

test('the five high-frequency class strings stay centralized (#176)', () => {
  for (const value of CENTRALIZED) {
    assert.equal(
      values.has(value),
      false,
      `class string must come from styles/classes.ts, but is still literal in: ${values.get(value)?.join(', ')}`,
    )
  }
})

test('duplicated static class strings do not increase', () => {
  console.log(
    `[#176] ${files.length} .vue files, ${values.size} distinct static classes, ` +
      `${duplicated.length} distinct duplicated (baseline ${MAX_DISTINCT_DUPLICATED})`,
  )
  assert.ok(
    duplicated.length <= MAX_DISTINCT_DUPLICATED,
    `distinct duplicated class strings grew from ${MAX_DISTINCT_DUPLICATED} to ${duplicated.length}`,
  )
})
