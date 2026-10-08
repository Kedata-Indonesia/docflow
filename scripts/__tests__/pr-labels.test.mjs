/**
 * Static guards for the PR auto-labeller (`.github/workflows/pr-labels.yml`).
 *
 * The workflow turns a conventional-commit PR title into the label GitHub groups
 * release notes by (`.github/release.yml`). These checks keep the trigger, the
 * write scopes, the REST usage, and the title -> label mapping honest without a
 * YAML dependency.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const WORKFLOW = join(ROOT, '.github', 'workflows', 'pr-labels.yml')
const RELEASE_CONFIG = join(ROOT, '.github', 'release.yml')
const yaml = readFileSync(WORKFLOW, 'utf8')
const releaseConfig = readFileSync(RELEASE_CONFIG, 'utf8')

/** The workflow's shell lines, with YAML comments stripped. */
const code = yaml
  .split('\n')
  .filter((line) => !/^\s*#/.test(line))
  .join('\n')

const MANAGED = [
  'breaking',
  'feature',
  'fix',
  'documentation',
  'performance',
  'dependencies',
]

test('the labeller runs on pull_request_target for the right events', () => {
  assert.match(yaml, /pull_request_target:/, 'fork PRs must still be labelled')
  assert.match(
    yaml,
    /types:\s*\[opened, edited, reopened\]/,
    'editing the title must re-label the PR',
  )
  assert.ok(
    !/^\s*(-\s*)?pull_request\s*:\s*$/m.test(yaml),
    'plain `pull_request` cannot write labels on fork PRs',
  )
})

test('the labeller holds only the write scopes it needs', () => {
  assert.match(yaml, /issues:\s*write/, 'adding labels needs issues: write')
  assert.match(yaml, /pull-requests:\s*write/, 'labelling a PR needs pull-requests: write')
  assert.match(yaml, /contents:\s*read/, 'the job must not write the repo contents')
})

test('the job never checks out PR code', () => {
  assert.ok(!/actions\/checkout/.test(code), 'a checkout would expose fork code')
  assert.ok(!/\$\{\{\s*github\.event\.pull_request\.head/.test(code))
})

test('labels go through the REST API, never `gh pr edit`', () => {
  assert.match(code, /gh api -X POST/)
  assert.match(code, /issues\/\$\{PR\}\/labels/)
  assert.ok(
    !/gh pr edit/.test(code),
    '`gh pr edit` breaks on the repo Projects-classic GraphQL deprecation',
  )
})

test('stale managed labels are reconciled, not just added', () => {
  assert.match(code, /gh api -X DELETE/, 'a title edit must drop the old label')
  assert.match(code, /repos\/\$\{GITHUB_REPOSITORY\}\/issues\/\$\{PR\}\/labels\/\$\{label\}/)
  assert.match(code, /managed=\(/, 'the workflow must scope which labels it owns')
})

test('the release-note labels are bootstrapped if missing', () => {
  assert.match(code, /gh label list/, 'must check existing labels first')
  assert.match(code, /gh label create/, 'must create a missing label')
  assert.ok(
    !/gh label create[^\n]*--force/.test(code),
    'bootstrap must never overwrite an existing label',
  )
})

test('conventional types map to the expected release-note labels', () => {
  assert.match(code, /feat\|feature\)\s+labels\+=\('feature'\)/)
  assert.match(code, /fix\)\s+labels\+=\('fix'\)/)
  assert.match(code, /docs\)\s+labels\+=\('documentation'\)/)
  assert.match(code, /perf\)\s+labels\+=\('performance'\)/)
  assert.match(code, /labels\+=\('breaking'\)/, 'a `!` break must add the breaking label')
  assert.match(code, /labels\+=\('dependencies'\)/)
})

test('breaking is detected only on a `!` next to the colon', () => {
  assert.match(code, /case "\$head" in \*'!'\)/)
  assert.ok(
    !code.includes("*'!'*)"),
    'a `!` inside the scope must not count as breaking',
  )
})

test('every label the workflow can apply is a category in .github/release.yml', () => {
  for (const label of MANAGED) {
    assert.ok(
      yaml.includes(`'${label}'`),
      `the workflow must be able to apply the "${label}" label`,
    )
    assert.ok(
      releaseConfig.includes(`- ${label}`),
      `"${label}" must appear as a category label in .github/release.yml`,
    )
  }
})
