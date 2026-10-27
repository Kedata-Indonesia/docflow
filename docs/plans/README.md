# Plans — DocFlow execution archive

This folder holds the plans that were written **before** a piece of work started. They are
frozen once the work ships: they are useful for *why* decisions were made, not for *what
the product does today*. The code, the [CHANGELOG](../../CHANGELOG.md), and the
[library contract](../reference/LIBRARY_CONTRACT.md) are authoritative.

> **Read the status line at the top of each file.** Some plans shipped long ago; some are
> still drafts. Nothing here is updated after the fact.
>
> These files were written when the library and the host application lived in one
> monorepo. Links to `apps/*` and `docker/*` therefore point at code that now lives in
> [`Kedata-Indonesia/docflow-app`](https://github.com/Kedata-Indonesia/docflow-app) and may
> not resolve from this repo. That is expected, which is why `docs/plans/` is excluded
> from `pnpm docs:check`.

## Adding a new plan

1. Name it after the work, not the ticket: `suggesting-mode-and-track-changes.md`.
2. Put the status line first: `**Status:** draft | approved | in progress | shipped <date> | superseded by <link>`.
3. Link the issue(s) and the contract section it touches.
4. When the work ships, change the status line and move on — do not rewrite the plan to
   match the final code.

## Index

### Architecture & boundary

| Plan | Kind |
|---|---|
| [phase-0-boundary-contract.md](./phase-0-boundary-contract.md) | Implementation plan — library/app contract + ESLint guardrail |
| [phase-2-library-injection-points.md](./phase-2-library-injection-points.md) | Implementation plan — injection ports (`onUpdate`, `collaboration`, `onImageUpload`, …) |
| [PLUGGABLE_AI_PROVIDER.md](./PLUGGABLE_AI_PROVIDER.md) | Design — AI provider port, key storage, browser-direct vs proxy |
| [PER_USER_BYOK.md](./PER_USER_BYOK.md) | Design — per-user bring-your-own-key |

### Collaboration, storage, deployment

| Plan | Kind |
|---|---|
| [phase-1-collab-persistence.md](./phase-1-collab-persistence.md) | Implementation plan — Yjs persistence |
| [offline-mirror-lifecycle-162.md](./offline-mirror-lifecycle-162.md) | Implementation plan — offline mirror purge + quota guard (issue #162) |
| [phase-3-apps-web-split.md](./phase-3-apps-web-split.md) | Implementation plan — split the host app out of the monorepo |
| [phase-4-self-hosted-assets-storage.md](./phase-4-self-hosted-assets-storage.md) | Implementation plan — image/file storage adapters |
| [phase-8-deployment-packaging.md](./phase-8-deployment-packaging.md) | Implementation plan — on-prem packaging (host repo) |
| [sprint-9-10-execution-plan.md](./sprint-9-10-execution-plan.md) | Sprint plan |

### Editor features

| Plan | Kind |
|---|---|
| [phase-5-export-pdf-docx.md](./phase-5-export-pdf-docx.md) | Implementation plan — export formats |
| [phase-6-citations-references.md](./phase-6-citations-references.md) | Implementation plan — CSL citations and bibliography |
| [phase-7-ai-assistance.md](./phase-7-ai-assistance.md) | Implementation plan — inline AI transforms and generation |
| [phase-7e-rag-cited-drafting.md](./phase-7e-rag-cited-drafting.md) | Implementation plan — RAG-cited drafting |
| [phase-9-google-docs-parity.md](./phase-9-google-docs-parity.md) | Implementation plan — parity features |
| [clipboard-paste-pipeline-plan.md](./clipboard-paste-pipeline-plan.md) | Implementation plan + status log — paste normalization, paste-table pagination |
| [suggesting-mode-and-track-changes.md](./suggesting-mode-and-track-changes.md) | Design — suggestion marks, accept/reject |
| [orphaned-comment-threads-plan.md](./orphaned-comment-threads-plan.md) | Design — orphaned comment detection |
| [table-column-resize-fix-plan.md](./table-column-resize-fix-plan.md) | Implementation plan — column resize |
| [insert-table-of-contents-plan.md](./insert-table-of-contents-plan.md) | Draft — table-of-contents node |
| [tailwind4-migration-plan.md](./tailwind4-migration-plan.md) | Completed — Tailwind CSS 3 → 4 migration |

### Menu / product roadmaps (drafts)

| Plan | Kind |
|---|---|
| [feature-enhancement-roadmap.md](./feature-enhancement-roadmap.md) | Roadmap draft — Google-Docs-class feature set |
| [file-menu-professionalization-plan.md](./file-menu-professionalization-plan.md) | Draft — File menu |
| [edit-menu-professionalization-plan.md](./edit-menu-professionalization-plan.md) | Draft — Edit menu |
| [github-issues-execution-order.md](./github-issues-execution-order.md) | Draft — issue sequencing |
