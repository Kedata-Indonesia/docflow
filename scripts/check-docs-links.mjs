#!/usr/bin/env node
/**
 * Fails when a relative link in the living documentation points at a file that
 * does not exist, or when a `docs/...md` reference names a missing path.
 *
 * Scope: the docs people read to *use or run* the product today — the repo
 * root docs, `docs/README.md`, `docs/COMMUNITY.md`, and the `product/`,
 * `guides/`, `reference/`, `operations/`, `audits/` and `evidence/` folders.
 * `docs/plans/` is deliberately excluded: those are frozen execution snapshots
 * from the pre-split monorepo and legitimately mention files that live in the
 * host repo (`apps/`, `docker/`). See docs/plans/README.md.
 *
 * Usage:
 *   node scripts/check-docs-links.mjs
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const ROOT_FILES = [
  'README.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'CODE_OF_CONDUCT.md',
  'CHANGELOG.md',
]
const DOC_DIRS = ['product', 'guides', 'reference', 'operations', 'audits', 'evidence']
const DOC_FILES = ['docs/README.md', 'docs/COMMUNITY.md']

const rel = (p) => relative(ROOT, p).split(sep).join('/')

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const p = join(dir, entry.name)
    if (entry.isDirectory()) walk(p, out)
    else if (p.endsWith('.md')) out.push(p)
  }
  return out
}

const files = [
  ...ROOT_FILES.map((f) => join(ROOT, f)).filter(existsSync),
  ...DOC_FILES.map((f) => join(ROOT, f)).filter(existsSync),
  ...DOC_DIRS.flatMap((d) => (existsSync(join(ROOT, 'docs', d)) ? walk(join(ROOT, 'docs', d)) : [])),
]

const broken = []

function checkRelativeLink(file, target, line) {
  const pathPart = target.split('#')[0].split('?')[0]
  if (!pathPart) return
  if (/^(https?:|mailto:|tel:|data:|#|\/)/.test(pathPart)) return
  let decoded = pathPart
  try {
    decoded = decodeURIComponent(pathPart)
  } catch {
    /* keep the raw value */
  }
  const abs = resolve(ROOT, dirname(rel(file)), decoded)
  if (!existsSync(abs)) {
    broken.push({
      file: rel(file),
      line,
      target,
      reason: 'relative link target does not exist',
    })
  }
}

for (const file of files) {
  const raw = readFileSync(file, 'utf8')
  // Blank out fenced code blocks (keep newlines so line numbers stay right);
  // links inside code samples are illustrations, not navigation.
  const text = raw.replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, ' '))
  const lines = text.split('\n')

  lines.forEach((line, index) => {
    const lineNo = index + 1

    // Plain `docs/...md` references (backticks, prose) are repo-root relative.
    const refRe = /`(docs\/[^`\s]+\.md)`/g
    let match
    while ((match = refRe.exec(line))) {
      if (match[1].includes('*')) continue // glob/placeholder, not a real path
      if (!existsSync(join(ROOT, match[1]))) {
        broken.push({
          file: rel(file),
          line: lineNo,
          target: match[1],
          reason: 'referenced path does not exist',
        })
      }
    }

    // Ignore inline code (`[label](url)` samples) and fenced blocks (handled below).
    const prose = line.replace(/`[^`]*`/g, (span) => ' '.repeat(span.length))
    const linkRe = /\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
    while ((match = linkRe.exec(prose))) {
      if (match[1].includes('*')) continue
      checkRelativeLink(file, match[1], lineNo)
    }
  })
}

// Images use the same `](target)` syntax and are covered by the link pass above.

if (broken.length === 0) {
  console.log(`docs:check — ${files.length} files, no broken links`)
  process.exit(0)
}

for (const b of broken) {
  console.error(`${b.file}:${b.line}  ${b.target}  (${b.reason})`)
}
console.error(`\ndocs:check — ${broken.length} broken link(s) in ${files.length} files`)
process.exit(1)
