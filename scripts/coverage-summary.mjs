#!/usr/bin/env node
/**
 * Render the per-package coverage summary (written by `pnpm test:coverage`) as a
 * markdown table in the GitHub Actions job summary and on stdout (issue #174).
 *
 * Usage: node scripts/coverage-summary.mjs
 */
import { appendFileSync, existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PACKAGES = path.join(ROOT, 'packages')

const rows = []
for (const name of readdirSync(PACKAGES).sort()) {
  const file = path.join(PACKAGES, name, 'coverage', 'coverage-summary.json')
  if (!existsSync(file)) continue
  const { total } = JSON.parse(readFileSync(file, 'utf8'))
  rows.push({
    name,
    lines: total.lines.pct,
    statements: total.statements.pct,
    branches: total.branches.pct,
    functions: total.functions.pct,
  })
}

if (rows.length === 0) {
  console.log('No coverage-summary.json found — run `pnpm test:coverage` first.')
  process.exit(0)
}

const cell = (value) => `${value.toFixed(2)}%`
const table = [
  '## Coverage',
  '',
  '| Package | Lines | Statements | Branches | Functions |',
  '| --- | --: | --: | --: | --: |',
  ...rows.map(
    (row) =>
      `| \`${row.name}\` | ${cell(row.lines)} | ${cell(row.statements)} | ${cell(row.branches)} | ${cell(row.functions)} |`,
  ),
  '',
].join('\n')

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${table}\n`)
} else {
  console.log(table)
}
