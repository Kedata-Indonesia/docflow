/**
 * Static guards for the release workflow (incident: run 37709011366).
 *
 * The "Commit version bumps to main" step aborted with
 * "cannot pull with rebase: You have unstaged changes." because the publish
 * step appended the npm token to the TRACKED `.npmrc`. `git pull --rebase`
 * refuses to run on a dirty tree, so the bump commit never reached `main` and
 * the repo drifted behind npm (the publish itself had succeeded).
 *
 * These assertions lock in both halves of the fix. The workflow is read as text
 * on purpose: three substring checks do not justify a YAML dependency here.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const WORKFLOW = join(ROOT, '.github', 'workflows', 'publish.yml')
const yaml = readFileSync(WORKFLOW, 'utf8')

/** Body of a `- name: <name>` step, up to the next step at the same depth. */
function stepBody(name) {
  const start = yaml.indexOf(`- name: ${name}`)
  assert.notEqual(start, -1, `workflow step not found: ${name}`)
  const rest = yaml.slice(start)
  const next = rest.indexOf('\n      - ')
  return next === -1 ? rest : rest.slice(0, next)
}

test('publish step does not write the npm token into the tracked .npmrc', () => {
  const body = stepBody('Publish @kedataindo/* to npm')
  assert.ok(body.length > 0, 'publish step body is empty')
  assert.doesNotMatch(
    body,
    />>\s*\.npmrc/,
    'the repo `.npmrc` is tracked — writing the token there dirties the tree',
  )
  assert.match(
    body,
    /NPM_CONFIG_USERCONFIG/,
    'the token must be written to npm user config, outside the checkout',
  )
})

test('commit-back discards stray tree changes before rebasing', () => {
  const body = stepBody('Commit version bumps to main')
  const reset = body.indexOf('git reset --hard HEAD')
  assert.notEqual(
    reset,
    -1,
    'a dirty tree makes `git pull --rebase` abort and strands the bump commit',
  )
  assert.ok(
    reset < body.indexOf('for attempt in'),
    'the tree reset must run before the rebase retry loop',
  )
})
