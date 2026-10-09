#!/usr/bin/env node
/**
 * Restores `examples/playground`, the UI review harness, from git.
 *
 * The playground is tracked in-repo, so this script is only needed to reset a
 * locally modified harness back to the pinned snapshot — replacing the cryptic
 * `git archive … | tar -x` incantation with one command.
 *
 * Usage:
 *   pnpm playground:restore            # unpack from the pinned revision
 *   pnpm playground:restore --force    # replace an existing examples/
 *   node scripts/restore-playground.mjs --ref <commit-ish> [--root <dir>]
 */
import { execFileSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Pinned snapshot of the harness. `0861b95` is the last revision that tracked
 * `examples/` before the folder was re-tracked — its copy still carries the
 * original Indonesian strings, so restoring it is a deliberate rollback, not a
 * refresh. Pass `--ref HEAD` to pull the current tracked version instead.
 */
const DEFAULT_REF = '0861b95'
const TARGET = 'examples'

const args = process.argv.slice(2)
const force = args.includes('--force')
const valueOf = (flag) => {
  const index = args.indexOf(flag)
  return index === -1 ? undefined : args[index + 1]
}
// `--root` exists so the script can be exercised against a scratch repo in tests.
const rawRoot = valueOf('--root')
if (args.includes('--root') && !rawRoot) {
  console.error('error: --root needs a directory value')
  process.exit(1)
}
const ROOT = resolve(rawRoot ?? REPO_ROOT)
const rawRef = valueOf('--ref')
if (args.includes('--ref') && !rawRef) {
  console.error('error: --ref needs a commit-ish value')
  process.exit(1)
}
const ref = rawRef ?? DEFAULT_REF

if (existsSync(join(ROOT, TARGET)) && !force) {
  console.error(
    `error: ${TARGET}/ already exists — pass --force to overwrite it`,
  )
  process.exit(1)
}

try {
  // `git archive` streams a tar of the tree; hand it to `tar` on stdin so the
  // script never shells out and works the same on Linux/macOS. Fetching the
  // archive first means a bad ref aborts before `--force` deletes anything.
  const archive = execFileSync('git', ['archive', ref, TARGET], {
    cwd: ROOT,
    maxBuffer: 64 * 1024 * 1024,
  })
  // `--force` replaces the folder rather than merging into it, so stale files
  // (`dist/`, local edits) cannot survive a "restore".
  if (force) rmSync(join(ROOT, TARGET), { recursive: true, force: true })
  execFileSync('tar', ['-x', '-C', ROOT], { input: archive })
  console.log(`Restored ${TARGET}/ from ${ref}. Next: pnpm install`)
} catch (error) {
  const detail = String(error.stderr ?? error.message)
  // A typo'd ref is the likeliest cause, so say so instead of blaming the clone.
  const hint = /not a valid object name|unknown revision|bad revision|bad object|not a tree object/i.test(
    detail,
  )
    ? `no such revision "${ref}" — check the --ref value`
    : 'is this a git clone?'
  console.error(`error: could not restore ${TARGET}/ — ${hint}\n${detail}`)
  process.exit(1)
}
