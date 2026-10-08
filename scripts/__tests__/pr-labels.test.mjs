/**
 * Static guards for the PR auto-labeller (`.github/workflows/pr-labels.yml`).
 *
 * The workflow turns a conventional-commit PR title into the label GitHub groups
 * release notes by (`.github/release.yml`). These checks keep the trigger, the
 * write scopes, and the title -> label mapping honest without a YAML dependency.
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

test('the labeller runs on pull_request_target for the right events', () => {
  assert.match(yaml, /pull_request_target:/, 'fork PRs must still be labelled')
  assert.match(
    yaml,
    /types:\s*\[opened, edited, reopened\]/,
    'editing the title must re-label the PR',
  )
  assert.ok(
    !/^\s{2}pull_request:\s*$/m.test(yaml),
    'plain `pull_request` cannot write labels on fork PRs',
  )
})

test('the labeller holds only the write scopes it needs', () => {
  assert.match(yaml, /issues:\s*write/, 'adding labels needs issues: write')
  assert.match(yaml, /pull-requests:\s*write/, 'labelling a PR needs pull-requests: write')
  assert.match(yaml, /contents:\s*read/, 'the job must not write the repo contents')
})

test('labels go through the REST API, never `gh pr edit`', () => {
  // Comments may name the broken command; only real shell lines matter.
  const code = yaml
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n')
  assert.match(code, /gh api -X POST/)
  assert.match(code, /issues\/\$\{PR\}\/labels/)
  assert.ok(
    !/gh pr edit/.test(code),
    '`gh pr edit` breaks on the repo Projects-classic GraphQL deprecation',
  )
})

test('conventional types map to the expected release-note labels', () => {
  assert.match(yaml, /feat\|feature\)\s+labels\+=\('feature'\)/)
  assert.match(yaml, /fix\)\s+labels\+=\('fix'\)/)
  assert.match(yaml, /docs\)\s+labels\+=\('documentation'\)/)
  assert.match(yaml, /perf\)\s+labels\+=\('performance'\)/)
  assert.match(yaml, /labels\+=\('breaking'\)/, 'a `!` break must add the breaking label')
})

test('every applied label exists in .github/release.yml', () => {
  for (const label of [
    'breaking',
    'feature',
    'fix',
    'documentation',
    'performance',
    'dependencies',
  ]) {
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
