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

This repo contains the **library packages only** (`packages/*`). The deployable app (web UI + API server) lives in [`docflow-app`](https://github.com/Kedata-Indonesia/docflow-app).

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

1. Fork the repo and create a branch from `main` (`feat/...`, `fix/...`, or `docs/...`).
2. Make your change with the verification steps above passing.
3. Open the PR against `main` with:
   - **What** changed and **why**
   - **How** it works (key implementation notes)
   - **Testing** — what you ran and its result
   - Screenshots/GIFs for UI changes
4. Keep PRs focused — one concern per PR. A PR touching both `packages/*` and app-specific concerns is usually a sign it should be split.
5. We aim to respond to every PR and issue **within 24 hours**.

## Reporting bugs

Open an issue with:

- What you did, what you expected, what happened
- DocFlow package versions (`package.json`)
- Browser / OS
- Minimal reproduction (a small content JSON or a fork of the demo helps a lot)

## License

By contributing, you agree that your contributions are licensed under the [Apache License 2.0](./LICENSE).

Questions (Indonesian / English): **info@kedata.online**
