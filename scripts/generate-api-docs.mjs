#!/usr/bin/env node
/**
 * Generates the `<DocsEditor>` props / emits tables in README.md from the single
 * source of truth: `packages/vue/src/components/docsEditorContracts.ts`.
 *
 * The tables live between HTML comment markers, so regenerating is idempotent
 * and never touches the rest of the README.
 *
 * Usage:
 *   node scripts/generate-api-docs.mjs          # rewrite the marked blocks
 *   node scripts/generate-api-docs.mjs --check  # fail if README is stale (CI)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CONTRACT = join(ROOT, 'packages/vue/src/components/docsEditorContracts.ts')
const README = join(ROOT, 'README.md')

/** Types that would otherwise leak internals into the README. */
const TYPE_LABELS = {
  "NonNullable<EditorOptions['collaboration']>": 'CollaborationOptions | CollaborationSetup',
}
/** JSDoc prefixes that describe repo process, not public behaviour. */
const INTERNAL_PREFIX = /^(Phase\s+[^—]*|Issue\s+#\d+)\s*—\s*/

const MARKERS = {
  props: { begin: '<!-- api:props:begin -->', end: '<!-- api:props:end -->' },
  emits: { begin: '<!-- api:emits:begin -->', end: '<!-- api:emits:end -->' },
}

function jsDocText(node, source) {
  const comment = node.jsDoc?.[0]?.comment
  if (comment) {
    const raw = Array.isArray(comment) ? comment.map((part) => part.text ?? '').join('') : comment
    return raw.replace(/\s+/g, ' ').trim()
  }
  // TypeScript only exposes `/** */` blocks via `node.jsDoc`; fall back to the
  // leading `//` lines so a `//`-documented prop is not silently omitted.
  const ranges = ts.getLeadingCommentRanges(source.text, node.pos) ?? []
  return ranges
    .filter((range) => source.text.slice(range.pos, range.pos + 2) === '//')
    .map((range) => source.text.slice(range.pos, range.end).replace(/^\/\/\s?/, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Strip repo-process notes (phase/issue tags) but keep the user-facing text
 * intact — no truncation, so documented caveats never get silently dropped.
 */
function tidy(text) {
  const cleaned = text
    .replace(INTERNAL_PREFIX, '')
    .replace(/\s*\(Phase\s+[\w-]+[^)]*\)/g, '')
    .replace(/\s*—\s*Issue\s+#\d+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  // Stripping a "Phase 9 — " prefix can leave a lowercase start.
  return /^[a-z]/.test(cleaned) ? cleaned[0].toUpperCase() + cleaned.slice(1) : cleaned
}

/** `x satisfies T` / `x as T` still has the literal inside. */
function unwrapExpression(node) {
  if (ts.isSatisfiesExpression?.(node) || node.kind === ts.SyntaxKind.SatisfiesExpression) {
    return node.expression
  }
  if (ts.isAsExpression?.(node) || node.kind === ts.SyntaxKind.AsExpression) {
    return node.expression
  }
  return node
}

function formatDefault(text) {
  let value = text.replace(/\s+/g, ' ').replace(/\s+as const$/, '').trim()
  const arrow = value.match(/^\(\s*\)\s*=>\s*(.+)$/)
  if (arrow) value = arrow[1].trim()
  const wrapped = value.match(/^\((\{.*\})\)$/)
  if (wrapped) value = wrapped[1]
  return value === 'undefined' ? '—' : value
}

function parseContract() {
  const source = ts.createSourceFile(
    CONTRACT,
    readFileSync(CONTRACT, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const props = []
  const defaults = new Map()
  const emits = []

  for (const node of source.statements) {
    if (ts.isInterfaceDeclaration(node) && node.name.text === 'DocsEditorProps') {
      for (const member of node.members) {
        if (!ts.isPropertySignature(member) || !member.name) continue
        props.push({
          name: member.name.getText(source),
          type: member.type ? member.type.getText(source) : 'unknown',
          description: tidy(jsDocText(member, source)),
        })
      }
    }

    if (ts.isInterfaceDeclaration(node) && node.name.text === 'DocsEditorEmits') {
      for (const member of node.members) {
        if (!ts.isPropertySignature(member)) continue
        const name = ts.isStringLiteral(member.name) ? member.name.text : member.name.getText(source)
        const payload =
          member.type && ts.isTupleTypeNode(member.type)
            ? member.type.elements
                .map((el) =>
                  ts.isNamedTupleMember(el)
                    ? `${el.name.getText(source)}${el.questionToken ? '?' : ''}: ${el.type.getText(source)}`
                    : el.getText(source),
                )
                .join(', ')
            : ''
        emits.push({ name, payload, description: tidy(jsDocText(member, source)) })
      }
    }

    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || decl.name.text !== 'docsEditorPropDefaults') continue
        if (!decl.initializer) continue
        const literal = unwrapExpression(decl.initializer)
        if (!ts.isObjectLiteralExpression(literal)) continue
        for (const property of literal.properties) {
          if (!ts.isPropertyAssignment(property)) continue
          defaults.set(property.name.getText(source), formatDefault(property.initializer.getText(source)))
        }
      }
    }
  }

  if (props.length === 0 || emits.length === 0) {
    throw new Error(`unable to parse contract: ${props.length} props, ${emits.length} emits`)
  }
  return { props, defaults, emits }
}

const cell = (text) => text.replace(/\|/g, '\\|')

function renderProps({ props, defaults }) {
  const lines = ['| Prop | Type | Default | Description |', '|------|------|---------|-------------|']
  for (const prop of props) {
    const type = cell(TYPE_LABELS[prop.type] ?? prop.type)
    const fallback = cell(defaults.get(prop.name) ?? '—')
    lines.push(`| \`${prop.name}\` | \`${type}\` | \`${fallback}\` | ${cell(prop.description)} |`)
  }
  return lines.join('\n')
}

function renderEmits({ emits }) {
  const hasDescriptions = emits.some((emit) => emit.description)
  const head = hasDescriptions
    ? ['| Event | Payload | Description |', '|-------|---------|-------------|']
    : ['| Event | Payload |', '|-------|---------|']
  for (const emit of emits) {
    const row = `| \`${emit.name}\` | ${emit.payload ? `\`${cell(emit.payload)}\`` : '—'} |`
    head.push(hasDescriptions ? `${row} ${cell(emit.description)} |` : row)
  }
  return head.join('\n')
}

function replaceBlock(markdown, { begin, end }, body) {
  const start = markdown.indexOf(begin)
  const stop = markdown.indexOf(end)
  if (start === -1 || stop === -1 || stop < start) {
    throw new Error(`marker not found in README.md: ${begin} … ${end}`)
  }
  return `${markdown.slice(0, start + begin.length)}\n${body}\n${markdown.slice(stop)}`
}

const contract = parseContract()
const current = readFileSync(README, 'utf8')
let next = replaceBlock(current, MARKERS.props, renderProps(contract))
next = replaceBlock(next, MARKERS.emits, renderEmits(contract))

if (process.argv.includes('--check')) {
  if (next === current) {
    console.log(`README.md up to date (${contract.props.length} props, ${contract.emits.length} emits)`)
    process.exit(0)
  }
  console.error('README.md is stale — run: pnpm docs:api')
  process.exit(1)
}

if (next === current) {
  console.log(`README.md already up to date (${contract.props.length} props, ${contract.emits.length} emits)`)
} else {
  writeFileSync(README, next)
  console.log(`README.md updated (${contract.props.length} props, ${contract.emits.length} emits)`)
}
