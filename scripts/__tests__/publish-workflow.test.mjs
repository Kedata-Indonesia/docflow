/**
 * Static guards for the release workflow. The workflow is read as text on
 * purpose: substring checks do not justify a YAML dependency here.
 *
 * Two incidents shaped the commit-back step:
 *
 * 1. run 37709011366 — the step aborted with "cannot pull with rebase: You have
 *    unstaged changes." because the publish step appended the npm token to the
 *    TRACKED `.npmrc`. The bump never reached `main`; the repo drifted behind npm
 *    (the publish itself had succeeded).
 * 2. run 37713844249 — `main` is protected by a ruleset that requires every
 *    change to go through a pull request, so the step's direct
 *    `git push HEAD:main` was rejected with `GH013: Changes must be made through
 *    a pull request` and the drift came back. The bump now lands as a PR that the
 *    workflow opens and merges itself.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const WORKFLOW = join(ROOT, '.github', 'workflows', 'publish.yml')
const yaml = readFileSync(WORKFLOW, 'utf8')

const COMMIT_BACK_STEP = 'Land version bumps on main via PR'

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

test('commit-back never pushes straight to main (the ruleset demands a PR)', () => {
  const body = stepBody(COMMIT_BACK_STEP)
  const pushes = body
    .split('\n')
    .filter((line) => /\bgit push\b/.test(line) && !line.trim().startsWith('#'))
  assert.ok(pushes.length > 0, 'the bump commit must be pushed somewhere')
  for (const line of pushes) {
    assert.ok(
      !/\bmain\b/.test(line),
      `a direct push to main is rejected with GH013 and strands the bump: ${line.trim()}`,
    )
  }
  assert.match(body, /gh pr create/, 'the bump must be published as a pull request')
  assert.match(body, /gh pr merge/, 'the workflow must merge that pull request itself')
})

test('the bump lands through a PR: push branch, create, merge, then verify', () => {
  const body = stepBody(COMMIT_BACK_STEP)
  const push = body.indexOf('git push')
  const create = body.indexOf('gh pr create')
  const merge = body.indexOf('gh pr merge')
  const loop = body.indexOf('for attempt in')
  const verify = body.indexOf('git merge-base --is-ancestor')
  for (const [name, at] of Object.entries({ push, create, merge, loop, verify })) {
    assert.notEqual(at, -1, `the PR route must keep its ${name} step`)
  }
  assert.ok(push < create, 'the bump branch must exist before the PR is opened')
  assert.ok(create < merge, 'the PR must exist before it is merged')
  assert.ok(loop < merge, 'the merge must sit inside the retry loop')
  assert.ok(merge < verify, 'the ancestor check must run after the retries')
})

test('workflow grants the pull-request permission the commit-back needs', () => {
  assert.match(
    yaml,
    /permissions:[\s\S]*?pull-requests:\s*write/,
    'creating/merging the bump PR needs `pull-requests: write`',
  )
  assert.match(
    yaml,
    /permissions:[\s\S]*?contents:\s*write/,
    'pushing the bump branch needs `contents: write`',
  )
})

test('the bump branch is unique per attempt so a re-run cannot collide', () => {
  const body = stepBody(COMMIT_BACK_STEP)
  assert.match(
    body,
    /BRANCH="release\/bump-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}"/,
    'GITHUB_RUN_ID survives "Re-run jobs"; without the attempt number a stale ' +
      'branch from the failed run rejects the push and aborts before the PR',
  )
})

test('commit-back discards stray tree changes before pushing', () => {
  const body = stepBody(COMMIT_BACK_STEP)
  const reset = body.indexOf('git reset --hard HEAD')
  assert.notEqual(
    reset,
    -1,
    'build/publish side effects must not ride along in the bump commit',
  )
  assert.ok(
    reset < body.indexOf('git push'),
    'the tree reset must run before the branch push',
  )
})

test('commit-back verifies the bump is on main instead of trusting the merge', () => {
  const body = stepBody(COMMIT_BACK_STEP)
  assert.match(
    body,
    /git merge-base --is-ancestor HEAD FETCH_HEAD/,
    'a green run must never leave the repo drifting behind npm',
  )
  assert.match(
    body,
    /::error::version bump did not reach main/,
    'the drift guard must fail loudly',
  )
})
