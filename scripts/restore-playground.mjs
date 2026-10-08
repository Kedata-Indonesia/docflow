#!/usr/bin/env node
/**
 * Restores `examples/playground`, the local-only UI review harness, from git.
 *
 * The playground is deliberately untracked (`.gitignore`, PR #62) so a fresh
 * clone ships a clean library tree, but the folder is still useful for UI work.
 * This script unpacks the last revision that tracked it, replacing the cryptic
 * `git archive … | tar -x` incantation with one command.
 *
 * Usage:
 *   pnpm playground:restore            # unpack from the pinned revision
 *   pnpm playground:restore --force    # overwrite an existing examples/
 *   node scripts/restore-playground.mjs --ref <commit-ish> [--root <dir>]
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Last commit that tracked `examples/` (see README → Development → Playground). */
const DEFAULT_REF = '0861b95'
const TARGET = 'examples'

const args = process.argv.slice(2)
const force = args.includes('--force')
const valueOf = (flag) => {
  const index = args.indexOf(flag)
  return index === -1 ? undefined : args[index + 1]
}
// `--root` exists so the script can be exercised against a scratch repo in tests.
const ROOT = resolve(valueOf('--root') ?? REPO_ROOT)
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
  // script never shells out and works the same on Linux/macOS.
  const archive = execFileSync('git', ['archive', ref, TARGET], {
    cwd: ROOT,
    maxBuffer: 64 * 1024 * 1024,
  })
  execFileSync('tar', ['-x', '-C', ROOT], { input: archive })
  console.log(`Restored ${TARGET}/ from ${ref}. Next: pnpm install`)
} catch (error) {
  console.error(
    `error: could not restore ${TARGET}/ from "${ref}" — is this a git clone?\n` +
      String(error.stderr ?? error.message),
  )
  process.exit(1)
}
