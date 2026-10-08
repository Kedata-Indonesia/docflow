/**
 * Guards `scripts/restore-playground.mjs` — the one-command replacement for the
 * `git archive … | tar -x` incantation documented before PR #62.
 *
 * Each test drives the real CLI against a scratch repo via `--root`, so the
 * extraction, the overwrite guard, and the error path are all exercised without
 * touching the working tree.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCRIPT = join(ROOT, 'scripts', 'restore-playground.mjs')

/** A throwaway git repo containing one committed `examples/playground/README.md`. */
function makeScratchRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'docflow-restore-'))
  mkdirSync(join(dir, 'examples', 'playground'), { recursive: true })
  writeFileSync(join(dir, 'examples', 'playground', 'README.md'), '# playground\n')
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' })
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'DocFlow Test')
  git('add', '-A')
  git('commit', '-qm', 'add playground')
  return dir
}

const run = (dir, ...extra) =>
  execFileSync('node', [SCRIPT, '--root', dir, '--ref', 'HEAD', ...extra], {
    encoding: 'utf8',
  })

/** Direct invocation for argument-parsing and error-path tests. */
const runRaw = (...args) =>
  execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8' })

test('restores examples/ from the requested revision', (t) => {
  const dir = makeScratchRepo()
  t.after(() => rmSync(dir, { recursive: true, force: true }))

  rmSync(join(dir, 'examples'), { recursive: true, force: true })
  const output = run(dir)

  assert.ok(existsSync(join(dir, 'examples', 'playground', 'README.md')))
  assert.match(output, /Restored examples\/ from HEAD/)
})

test('refuses to clobber an existing examples/ without --force', (t) => {
  const dir = makeScratchRepo()
  t.after(() => rmSync(dir, { recursive: true, force: true }))

  assert.throws(
    () => run(dir),
    (error) => {
      assert.match(String(error.stderr), /already exists — pass --force/)
      return true
    },
  )
})

test('--force overwrites an existing examples/', (t) => {
  const dir = makeScratchRepo()
  t.after(() => rmSync(dir, { recursive: true, force: true }))

  writeFileSync(join(dir, 'examples', 'playground', 'README.md'), 'stale\n')
  writeFileSync(join(dir, 'examples', 'playground', 'stale.txt'), 'leftover\n')
  run(dir, '--force')

  const restored = readFileSync(
    join(dir, 'examples', 'playground', 'README.md'),
    'utf8',
  )
  assert.equal(restored, '# playground\n')
  assert.ok(
    !existsSync(join(dir, 'examples', 'playground', 'stale.txt')),
    '--force must replace the folder, not merge into it',
  )
})

test('--root without a value fails loudly', () => {
  assert.throws(
    () => runRaw('--root'),
    (error) => {
      assert.match(String(error.stderr), /--root needs a directory value/)
      return true
    },
  )
})

test('--ref without a value fails loudly', (t) => {
  const dir = makeScratchRepo()
  t.after(() => rmSync(dir, { recursive: true, force: true }))

  assert.throws(
    () => runRaw('--root', dir, '--ref'),
    (error) => {
      assert.match(String(error.stderr), /--ref needs a commit-ish value/)
      return true
    },
  )
})

test('an unknown --ref is reported as a bad revision and deletes nothing', (t) => {
  const dir = makeScratchRepo()
  t.after(() => rmSync(dir, { recursive: true, force: true }))

  assert.throws(
    () =>
      runRaw(
        '--root',
        dir,
        '--force',
        '--ref',
        'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      ),
    (error) => {
      assert.match(String(error.stderr), /no such revision/)
      return true
    },
  )
  assert.ok(
    existsSync(join(dir, 'examples', 'playground', 'README.md')),
    'a bad ref must abort before --force removes anything',
  )
})
