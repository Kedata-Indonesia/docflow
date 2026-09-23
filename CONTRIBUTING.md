# Contributing to DocFlow

Thanks for your interest in improving DocFlow! This document explains how to
set up the project, the conventions we follow, and how to get a change merged.

## Code of Conduct

By participating you agree to abide by our
[Code of Conduct](./CODE_OF_CONDUCT.md).

## Prerequisites

- Node.js >= 20
- pnpm >= 9 (`corepack enable` is recommended)

## Setup

```bash
git clone https://github.com/Kedata-Indonesia/docflow.git
cd docflow
pnpm install
```

## Project layout

```
packages/
  core/            headless editor factory + plugin system
  layout-engine/   page split / pagination
  plugins/         built-in plugins (table, image, link, …)
  vue/             Vue 3 component + composables
  element/         Web Component wrapper
  export/          DOCX / Markdown / HTML export helpers
apps/
  demo/            thin, backend-free showcase
```

## The library boundary (important)

`packages/*` must **not** know about any backend. Persistence, auth, storage,
and AI are the host app's job, reached only through the injection ports declared
on `EditorOptions` (`onUpdate`, `collaboration`, `onImageUpload`, `aiStream`,
`aiDraft`).

- ❌ No imports from `apps/*`.
- ❌ No backend-only dependencies (`mongoose`, `express`, `better-auth`, …).
- ❌ No direct `fetch('/api/*')` or hardcoded external hosts.
- ❌ No document persistence inside the library (use the host's `onUpdate`).
- ✅ Add a new port instead of a leak, and document it.

ESLint enforces the import boundary for `packages/**`.

## Development workflow

```bash
pnpm build        # build all packages
pnpm typecheck    # TypeScript type check
pnpm test:unit    # Vitest unit tests
pnpm lint         # ESLint
pnpm dev          # run the demo app (Vite)
```

The order matters: run `pnpm build` **before** `pnpm typecheck` and
`pnpm test:unit`. `packages/element`, `packages/plugins`, and `apps/demo` resolve
their sibling packages through the built output in `packages/*/dist`, so in a
fresh clone the type check and some unit tests fail until you have built once.

Run the checks affected by your change before opening a PR. If you touch
`packages/core`, `packages/layout-engine`, or `packages/vue`, please run the
full set (`build`, `typecheck`, `test:unit`, `lint`).

## Commit messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(core): add page-size option
fix(layout-engine): avoid orphaned heading
docs: clarify collaboration ports
```

## Pull requests

1. Fork the repository and create a branch from `main`.
2. Keep the change focused; one concern per PR.
3. Add or update tests where behaviour changes.
4. Make sure CI (lint, typecheck, unit tests, build) is green.
5. Describe **what** changed and **why** in the PR description.

## Sign-off (DCO)

We use the [Developer Certificate of Origin](https://developercertificate.org/).
Sign off every commit:

```bash
git commit -s -m "feat(core): ..."
```

This adds a `Signed-off-by: Your Name <you@example.com>` trailer, certifying
that you have the right to submit the contribution under the project license.

## Licensing of contributions

DocFlow is licensed under the Apache License, Version 2.0. By submitting a
contribution you agree that it is licensed under the same terms (Apache-2.0 §5).
