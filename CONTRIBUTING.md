# Contributing to DocFlow

Thanks for your interest in contributing! DocFlow is an open-source (Apache-2.0), embeddable document editor engine. This guide covers how to get set up and what we expect in a pull request.

## Ground rules

- **`main` is protected.** All changes land via pull request — direct pushes are rejected.
- **Be honest in comparisons and claims.** Credibility with developers is our core asset.
- **The core stays Apache-2.0.** We don't accept changes that gate editor features behind paid services.
- **Open an issue first** for anything non-trivial (features, schema changes, architectural work) so we can align before you invest time. Small fixes (typos, obvious bugs) can go straight to a PR.

## Development setup

Requires **Node >= 20** and **pnpm >= 9**.

```bash
git clone git@github.com:Kedata-Indonesia/docflow.git
cd docflow
pnpm install
pnpm build        # build the library packages once
```

The playground in `examples/playground` mounts `<DocsEditor>` through the public API
only (no backend, no database) and is the recommended way to review UI changes. It is
**not tracked** in this repo (`.gitignore`, PR #62): restore it locally once with
`pnpm playground:restore` and `pnpm install`, then run
`pnpm build && pnpm dev` (http://localhost:5200). Use `pnpm dev:source` to edit
`packages/*` with HMR instead of rebuilding after every change.

> `pnpm-lock.yaml` still records an `examples/playground` importer. Without the folder a
> plain `pnpm install` prunes it, so `git checkout -- pnpm-lock.yaml` rather than
> committing that churn — or install with `pnpm install --frozen-lockfile`, which
> tolerates the missing project.

## Repository layout

This repo contains the **library packages only** (`packages/*`). The deployable app (web UI + API server) lives in `docflow-app`.

| Path | Contents |
|------|----------|
| `packages/core` | Headless editor factory + plugin system |
| `packages/vue` | Vue 3 `<DocsEditor>` component + composables |
| `packages/element` | `<docs-editor>` Web Component |
| `packages/plugins` | Built-in plugins (exported as `defaultPlugins`) |
| `packages/layout-engine` | Page split / pagination engine |
| `packages/export` | DOCX / Markdown export |
| `examples/playground` | Backend-free demo app that mounts `<DocsEditor>` via the public API (local-only, untracked, not published) |

### Architectural invariants (please don't violate)

- **ProseMirror state is the single source of truth.** Page layout and collaboration are derived views — never a second editable model.
- **Add editor features as plugins**, not by hardcoding extensions into `core`. See `packages/core/src/PluginSystem.ts` for the `DocsEditorPlugin` contract.
- **Library boundary:** `packages/*` must not import backend-only deps (mongoose, express, better-auth). Persistence/auth/storage/AI are the host app's job, reached through the injection ports in `docs/LIBRARY_CONTRACT.md`.
- **Intra-source imports use `.js` extensions** even for TypeScript files (e.g. `from './PluginSystem.js'`) — required by the ESM build output.

## Verification (required before every PR)

Run from the repo root:

```bash
pnpm lint          # ESLint
pnpm typecheck     # tsc / vue-tsc --noEmit (noUnusedLocals is on — dead bindings fail)
pnpm test:unit     # vitest
pnpm test:e2e      # Playwright, if editor UI/layout changed
pnpm build         # for affected packages
```

Scope to one package when iterating:

```bash
pnpm --filter @kedata-indonesia/docflow-core test:unit
pnpm --filter @kedata-indonesia/docflow-vue typecheck
```

## Commit style

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(vue): add table of contents block
fix(pagination): cap page count by content height
docs(readme): fix install steps
chore(deps): bump vite
```

Common scopes: `core`, `vue`, `element`, `plugins`, `layout-engine`, `export`, `pagination`, `collab`, `ci`, `readme`.

## Pull request process

1. Fork the repo and create a branch **from `main`** (`feat/...`, `fix/...`, or `docs/...`).
2. Make your change with the verification steps above passing.
3. Open the PR **against `main`** with:
   - **What** changed and **why**
   - **How** it works (key implementation notes)
   - **Testing** — what you ran and its result
   - Screenshots/GIFs for UI changes
4. Keep PRs focused — one concern per PR. A PR touching both `packages/*` and app-specific concerns is usually a sign it should be split.
5. We aim to respond to every PR and issue **within 24 hours**.

CI reads your PR **title**: the Conventional Commit type (`feat`, `fix`, `docs`,
`perf`) auto-applies the matching label (`feature`, `fix`, `documentation`,
`performance`), a dependency scope (`chore(deps)`, `build(deps)`) adds
`dependencies`, and a `!` right before the `:` (e.g. `feat(core)!: …`) also adds
`breaking`. Those labels are exactly what GitHub groups release notes by
(`.github/release.yml`), so a conventional title keeps the notes tidy — no manual
labelling needed.

## Branch & release flow

| Branch | Purpose |
|--------|---------|
| `main` | Default and only long-lived branch. Protected — all changes land via PR. |

Releases are cut from `main` by pushing a version tag (`v*`), which triggers the publish workflow. See [docs/PUBLISH.md](./docs/PUBLISH.md).

## Reporting issues

Issues are tracked on GitHub using the bug report / feature request forms. Follow these rules so we can help you quickly:

### Before opening an issue

1. **Search existing issues first.** If yours is a duplicate, add context to the existing one instead.
2. **Questions ("how do I...?")** belong in [Discussions Q&A](https://github.com/Kedata-Indonesia/docflow/discussions/categories/q-a), not in issues.
3. **Larger features and RFCs** — propose them in [Discussions → Ideas](https://github.com/Kedata-Indonesia/docflow/discussions/categories/ideas) first, so direction is aligned before an issue is opened.
4. **One problem per issue.** Don't bundle multiple bugs or several feature ideas into one report.

### Writing a good bug report

A bug report must let us reproduce the problem without back-and-forth. Every bug report needs:

- **Title:** short and specific. Good: `Pagination splits table rows across pages in Firefox`. Bad: `table broken`.
- **What happened vs. what you expected** — one or two sentences each.
- **Affected package & version** — e.g. `@kedataindo/docflow-vue 0.0.86` (from your `package.json`).
- **Steps to reproduce** — numbered, from a clean state, including the content JSON or document setup if relevant.
- **Minimal reproduction** — a small content JSON, a code snippet, or a fork of the demo that shows the bug. This is the single most valuable part of a bug report.
- **Environment** — browser + version, OS, framework (Vue / Web Component / headless).
- **Evidence** — screenshot or screen recording for visual bugs; console errors for functional bugs.

### Writing a good feature request

- **Start with the problem**, not the solution — what are you trying to build, and why?
- **Proposed solution** — how you imagine it working.
- **Alternatives considered** — what else did you think of, and why is your proposal better?
- Check the plugin system first — many features belong in a plugin rather than core.

### Security issues

Never report security vulnerabilities in a public issue. Email **info@kedata.online** with the subject `SECURITY`. We will acknowledge within 24 hours and work with you on a coordinated fix and disclosure.

### Issue etiquette

- No `+1` or `me too` comments — use emoji reactions instead.
- Stay on topic; spin off unrelated ideas into separate issues.
- Be respectful. See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## How maintainers handle issues

This is our triage flow — what happens to your issue after you open it:

| Step | What happens | Timeline |
|------|--------------|----------|
| 1. Acknowledge | Issue is labeled `triage` so you know it's seen. | Within **24 hours** |
| 2. Reproduce | A maintainer follows your repro steps (the minimal reproduction is what makes this fast). | Within **3 business days** |
| 3. Classify | Labeled `bug` or `enhancement`, plus package and priority. | With step 2 |
| 4. Need info? | If we can't reproduce, we ask questions and label `status: needs-info`. **The issue auto-closes after 14 days without a response** — reply to reopen. | — |
| 5. Decide | Accepted → assigned or labeled `help wanted` (great first issues are labeled `good first issue`). Duplicate → closed and linked to the original. Declined → closed as `wontfix` with an explanation. | Within **7 days** of triage |
| 6. Fix | Work happens on `development` via a PR that references the issue (`Closes #123`). | — |
| 7. Close & release | Merged to `development` → issue closes automatically. Shipped to `main` on the next release, noted in the release notes / CHANGELOG. | — |
| 8. Stale sweep | No activity for 60 days → `status: stale` label and a ping; 14 more days of silence → closed (reopenable). | Periodic |

We aim to answer every issue and PR **within 24 hours**, even if it's just "we've seen this, triage is coming."

## License

By contributing, you agree that your contributions are licensed under the [Apache License 2.0](./LICENSE).

Questions (Indonesian / English): **info@kedata.online**
