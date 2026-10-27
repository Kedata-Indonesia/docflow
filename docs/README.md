# DocFlow — Documentation

> **Status:** Living · **Last reviewed:** 2026-10-22 · **Audience:** integrators, operators, maintainers
>
> This page is the map. If a document is not linked from here, it is either historical
> (`product/`, `plans/`) or generated (the tables in [reference/API.md](./reference/API.md)).

This folder is the **living documentation** for the DocFlow library packages. It is
written for the people who embed the editor, run it, ship it, and change it. The
deployable application (web UI + API server) lives in
[`Kedata-Indonesia/docflow-app`](https://github.com/Kedata-Indonesia/docflow-app) and
has its own docs — anything in this folder that mentions `apps/*`, Docker, or the
SaaS stack is marked **historical** below.

> **Scope of this repo:** `packages/core`, `packages/layout-engine`, `packages/plugins`,
> `packages/vue`, `packages/element`, `packages/export`, plus `examples/playground`.
> Published to npm as `@kedataindo/docflow-*`. Apache-2.0.

---

## Start here

| I want to… | Read | Status |
|---|---|---|
| Put the editor in a Vue / React / vanilla app | [guides/INTEGRATION.md](./guides/INTEGRATION.md) | Living |
| Add real-time collaboration with my own auth | [guides/COLLAB_INTEGRATION.md](./guides/COLLAB_INTEGRATION.md) | Living |
| Wire AI drafting/completion through my own backend | [guides/EMBEDDING_AI.md](./guides/EMBEDDING_AI.md) | Living |
| Check which AI provider/base URLs work | [guides/AI_PROVIDERS.md](./guides/AI_PROVIDERS.md) | Living |
| Look up `<DocsEditor>` props and events | [reference/API.md](./reference/API.md) | Living — generated |
| Know which ports my host must implement | [reference/LIBRARY_CONTRACT.md](./reference/LIBRARY_CONTRACT.md) | **Living — source of truth** |
| Deploy the host application (Docker, nginx, DB, AI proxy) | [operations/DEPLOYMENT.md](./operations/DEPLOYMENT.md) | Host-repo runbook |
| Self-host the AI stack for the host app | [operations/SELF_HOSTED_AI.md](./operations/SELF_HOSTED_AI.md) | Host-repo runbook |
| Publish the packages to npm | [operations/PUBLISH.md](./operations/PUBLISH.md) | Living |
| See why a push to `main` is tagged `vYYYY.MM.DD.N` | [operations/RELEASING.md](./operations/RELEASING.md) | Living |
| Contribute or review a change | [../CONTRIBUTING.md](../CONTRIBUTING.md) + [../CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) | Living |
| Ask/answer questions, join the community | [COMMUNITY.md](./COMMUNITY.md) | Living |
| See what the product is meant to be | [product/PRD.md](./product/PRD.md), [product/ARCHITECTURE.md](./product/ARCHITECTURE.md) | Baseline / historical |
| Understand why the code looks like this | [plans/](./plans/) | Frozen snapshots |
| Read the latest quality review | [audits/](./audits/) | Dated reports |

Audience-specific writing guidance for AI agents and maintainers:
[guides/INTEGRATION_SKILLS.md](./guides/INTEGRATION_SKILLS.md).

---

## How this folder is organised

```
docs/
├── README.md                 ← you are here: the map + the rules
├── COMMUNITY.md              ← channels and code of conduct
├── product/                  ← what we build and why (baselines, not runbooks)
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   └── ENHANCEMENT_ROADMAP.md
├── guides/                   ← task-oriented, for people embedding the library
│   ├── INTEGRATION.md
│   ├── COLLAB_INTEGRATION.md
│   ├── EMBEDDING_AI.md
│   ├── AI_PROVIDERS.md
│   └── INTEGRATION_SKILLS.md
├── reference/                ← contracts and invariants
│   ├── API.md                (generated props / emits — do not hand-edit the tables)
│   └── LIBRARY_CONTRACT.md   (the library/app boundary — the single source of truth)
├── operations/               ← run it and ship it
│   ├── DEPLOYMENT.md
│   ├── SELF_HOSTED_AI.md
│   ├── PUBLISH.md
│   └── RELEASING.md
├── audits/                   ← dated reviews, decisions, evidence of quality work
├── plans/                    ← execution plans (frozen once shipped)
├── evidence/                 ← screenshots per issue/PR
└── assets/                   ← demo GIF and other media used by READMEs
```

Four kinds of documents live here. The kind decides how you edit it.

| Kind | Lives in | Rule |
|---|---|---|
| **Living** | `guides/`, `reference/`, `operations/`, `COMMUNITY.md`, this page | Update it in the **same PR** as the code it describes. Broken links fail CI. |
| **Baseline / historical** | `product/` | Keep for context; add a dated note when reality diverges. Do not treat as a runbook. |
| **Plans** | `plans/` | Written before the work, frozen after it ships. New plans get a status line at the top. |
| **Reports** | `audits/` | Dated and immutable. A later audit supersedes an earlier one; edit the index, not the report. |

---

## Sources of truth (in this order)

1. **The code and its tests** in `packages/*`.
2. [reference/LIBRARY_CONTRACT.md](./reference/LIBRARY_CONTRACT.md) for the library/app
   boundary and every injection port.
3. The generated API tables in [reference/API.md](./reference/API.md) — do not hand-edit; they come
   from `packages/vue/src/components/docsEditorContracts.ts`.
4. [../CHANGELOG.md](../CHANGELOG.md) for what changed and when.
5. This folder's guides for how to use the above.

If a guide and the contract disagree, the contract wins. Fix the guide in that PR.

---

## Commands that work in this repo

```bash
pnpm install
pnpm dev                # examples/playground against built packages → http://localhost:5200
pnpm dev:source         # same playground, resolving packages/*/src directly
pnpm build              # build every package
pnpm typecheck
pnpm lint
pnpm test:unit          # vitest, all packages
pnpm test:e2e           # playwright (needs a browser + the demo build)
pnpm docs:api           # regenerate the props/emits tables in reference/API.md
pnpm docs:api:check     # CI gate: those tables are not stale
pnpm docs:check         # CI gate: no broken links in the living docs
```

There is **no** `dev:server`, Docker Compose, or database in this repo — those belong to
the host application. See [operations/DEPLOYMENT.md](./operations/DEPLOYMENT.md).

---

## Keeping these docs alive

**When you change…**

| Change | Update |
|---|---|
| A public prop, emit, option, or port | `reference/LIBRARY_CONTRACT.md` + the relevant guide; run `pnpm docs:api` if the component contract changed |
| Package behaviour users rely on | `CHANGELOG.md` (Unreleased) + the affected guide |
| Publish/release automation | `operations/PUBLISH.md` / `operations/RELEASING.md` |
| Docs structure | This page's tree and tables |

**Review cadence:** the `reference/` contract is reviewed at least once per release; a
`Last updated:` line in a doc is a promise, so update it when you change the file. Do not
add a new `Last updated:` line to historical docs — their date is in the header or the
filename.

**Adding a doc:** put it in the folder whose table above matches its audience, link it
from this page, and give it a status line
(`**Status:** Living | Historical | Plan (frozen <date>)`). If it is a one-off report, put
it in `audits/` with a `YYYY-MM-DD-` prefix and add it to [audits/README.md](./audits/README.md).

**Not allowed:** duplicate the same explanation in two guides. Link to one place. The
link checker (`pnpm docs:check`) catches moved files, not duplicated prose — reviewers are
the gate for that.

---

## Audits

| Date | Report | Scope |
|---|---|---|
| 2026-10-24 | [audits/2026-10-24-landing-feedback.md](./audits/2026-10-24-landing-feedback.md) | External feedback on the landing copy & conversion, pre-launch |
| 2026-10-23 | [audits/2026-10-23-landing-audit.md](./audits/2026-10-23-landing-audit.md) | `docflow-landing` site: a11y, performance, SEO, headers, house gates |
| 2026-10-23 | [audits/2026-10-23-audit-followup.md](./audits/2026-10-23-audit-followup.md) | Re-audit at `67b76b0`: 14 carried over + 5 new findings |
| 2026-10-22 | [audits/2026-10-22-code-audit.md](./audits/2026-10-22-code-audit.md) | Whole-repo correctness, safety, scale, tests, speed, lean review |
| 2026-10-20 | [audits/2026-10-20-a11y-button-audit.md](./audits/2026-10-20-a11y-button-audit.md) | Accessible names of toolbar buttons (issue #170) |

---

## Historical docs — read with the date in mind

- [product/PRD.md](./product/PRD.md), [product/ENHANCEMENT_ROADMAP.md](./product/ENHANCEMENT_ROADMAP.md) —
  written when library and app lived in one monorepo. Useful for scope and intent.
- [product/ARCHITECTURE.md](./product/ARCHITECTURE.md) — the full cross-repo data-flow map,
  including the host app and its stores.
- [operations/DEPLOYMENT.md](./operations/DEPLOYMENT.md) and
  [operations/SELF_HOSTED_AI.md](./operations/SELF_HOSTED_AI.md) — operator runbooks for the
  **host** repo. The commands and compose files are not in this repo.
- [plans/](./plans/) — frozen execution plans. They reference `apps/*` and `docker/*` that
  moved to `docflow-app`; that is expected, and they are excluded from the link gate.
