# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> The project root is this `docflow/` directory (it holds the git repo, `package.json`, and `pnpm-workspace.yaml`). Run all commands from here.
>
> ⚠️ **Repository scope note:** this repository is **library-only** (`packages/*` + `examples/playground`). The deployable application (`apps/web`, `apps/server`, `apps/demo`, `docker/`, `e2e/`) lives in the companion repository [Kedata-Indonesia/docflow-app](https://github.com/Kedata-Indonesia/docflow-app).

## Commands

Package manager is **pnpm** (>=9, Node >=20). Run from the repo root:

```bash
pnpm install
pnpm build            # build all packages (pnpm -r run build)
pnpm dev              # run the playground app (examples/playground)
pnpm dev:source       # run the playground with live source aliasing
pnpm typecheck        # tsc/vue-tsc --noEmit across all packages
pnpm test:unit        # vitest run across all packages
pnpm test:scripts     # test release bump and library scripts (node --test)
pnpm lint             # eslint . --ext .ts,.vue
pnpm docs:api         # generate README API contract tables
pnpm docs:api:check   # verify generated API docs are up to date
```

Scope work to one package instead of running everything:

```bash
pnpm --filter @kedata-indonesia/docflow-core test:unit
pnpm --filter @kedata-indonesia/docflow-vue typecheck
```

Run a single unit test (vitest) inside a package directory:

```bash
cd packages/core && pnpm vitest run src/__tests__/Editor.test.ts
cd packages/core && pnpm vitest run -t "test name substring"
```

After any non-trivial change, verify with the affected package's `typecheck` + `test:unit`. `noUnusedLocals`/`noUnusedParameters` are on, so typecheck fails on dead bindings.

## Architecture

A pnpm workspace publishing a **framework-agnostic rich-text editor with page pagination and Yjs collaboration** as six layered npm packages (`@kedataindo/docflow-*` published, source `@kedata-indonesia/docflow-*`). Built on TipTap / ProseMirror.

### Layering (dependencies flow downward)

```
element (Web Component) ─┐
                         ├─→ vue (Vue 3 components + composables) ─→ core (headless factory)
plugins ─────────────────┴──────────────────────────────────────────┘   ↑
layout-engine (pagination measurement) ──────────────────────────────────┘
export (DOCX / ODT / RTF / Markdown export) ────────────────────────────┘
```

- **`packages/core`** — the headless heart. `createEditor()` ([Editor.ts](packages/core/src/Editor.ts)) builds a TipTap editor from a base StarterKit + `TextStyle` + `BlockAttributesExtension` + `PaginationPlus` (from `tiptap-pagination-plus`) + plugin extensions. It also owns `PluginSystem.ts` (the `DocsEditorPlugin` contract) and `Collaboration.ts` (Yjs setup).
- **`packages/plugins`** — built-in features (headings, lists, table, image, link, alignment, code block, fontSize, pageBreak, slashMenu, footnote, citations, …) each authored as a `DocsEditorPlugin`. Exported together as `defaultPlugins`.
- **`packages/layout-engine`** — pure measurement/pagination: `PageLayout` measures rendered block DOM (via `ResizeObserver`, debounced, with a shadow-DOM measuring pass) and `PageBreaker` computes where A4/Letter pages split. Framework-agnostic; consumed by the Vue layer to render page views.
- **`packages/vue`** — Vue 3 `<DocsEditor>` component, `useEditor` composable, and UI (toolbar, bubble menu, slash menu, rulers, sidebars). This is where the headless editor + layout engine are wired into a Google-Docs-like UI.
- **`packages/element`** — wraps the Vue component as a `<docs-editor>` Web Component with a shadow DOM (`shadow.css`) for use in any framework.
- **`packages/export`** — export utilities for DOCX, ODT, RTF, and Markdown, including citations and bibliographic references.
- **`examples/playground`** — backend-free local Vite playground mounting `<DocsEditor>` for UI review and manual testing.

### Core design invariants

- **ProseMirror state is the single source of truth.** Page layout and collaboration are *derived views* — never a second editable model. When changing editor behavior, mutate via ProseMirror/TipTap commands; let layout and collab react.
- **The plugin contract** (`DocsEditorPlugin` in [PluginSystem.ts](packages/core/src/PluginSystem.ts)): a plugin contributes `tiptapExtensions`, `toolbar` items, `slashCommands`, `commands` (custom command implementations), and `hooks` (`onInit`/`onDestroy`). `createActionMap` resolves toolbar/slash actions to either a plugin's custom command or a native TipTap command. Add editor features as plugins, not by hardcoding extensions into `core`.
- **Extension-name collisions:** because Vite may load a module more than once, extensions that could double-register (e.g. FontSize) are registered *only* via their plugin, not also in `Editor.ts`. Watch for duplicate-name errors when adding extensions.
- **`createEditor` rebuilds the whole TipTap editor** when `.use(plugin)` is called at runtime (`rebuildEditor` preserves JSON + selection). Adding a plugin is a full teardown/recreate, not a hot patch.
- **Collaboration** ([Collaboration.ts](packages/core/src/Collaboration.ts)): when `collaboration` is set, StarterKit history is disabled and the TipTap `Collaboration`/`CollaborationCursor` extensions bind to a `Y.Doc`. Providers are `webrtc` (zero-config P2P) or `websocket` (requires `websocketUrl`, backed by the host server). Yjs/webrtc/websocket are optional peer deps. In collab mode the Yjs doc is authoritative — `createEditor` never seeds the room from `content`; hosts seed via `initialStorageState`. Production topology: `websocket` + your own `websocketUrl` (no external calls).
- **Content migration:** `migrateContent` in `Editor.ts` flattens legacy `page`-wrapped and `tabbed-doc` documents on load. Preserve this when touching content ingestion.
- **Library boundary:** never import backend concerns into `packages/*`. Persistence, auth, storage, and AI are the host app's job, reached only through the injection ports catalogued in [docs/LIBRARY_CONTRACT.md](docs/LIBRARY_CONTRACT.md) (`onUpdate`, `collaboration`, `onImageUpload`; export hooks). A PR that touches both `packages/*` and host backend concerns is a boundary violation.

### Host Integration & Separation

- **Host Product Repository:** The deployable web app (`apps/web`), API / WebSocket collaboration server (`apps/server`), Docker configs, and full-stack E2E tests live in [`Kedata-Indonesia/docflow-app`](https://github.com/Kedata-Indonesia/docflow-app).
- **Boundary rule:** `packages/*` must never import from backend packages or call an LLM URL directly. Enforced by ESLint (`no-restricted-imports`).
- **AI assistance injection:** The library ships `aiPlugin` + port types in [`packages/plugins/src/ai.ts`](packages/plugins/src/ai.ts) and [`packages/core/src/ai/types.ts`](packages/core/src/ai/types.ts). The host app injects transports that handle authentication and server proxying.
- **Streaming safety invariant:** During AI stream previews, only **meta-only** ProseMirror transactions fire. The document is mutated in **exactly one** transaction on accept, keeping Yjs/CRDT sync clean.

## Conventions

- **Publishing:** packages ship to the **public npm registry** (`registry.npmjs.org`) as `@kedataindo/docflow-*`; the in-repo source scope stays `@kedata-indonesia` and the CI workflow rewrites name/deps/dist on publish. Internal deps use `workspace:*`. See [docs/PUBLISH.md](docs/PUBLISH.md).
- **Build tooling:** leaf/headless packages build with `tsup` (esm+cjs+dts); Vue/element packages build with `vite` + `vue-tsc` for declarations.
- **Intra-source imports use `.js` extensions** (e.g. `import ... from './PluginSystem.js'`) even for TS files — required by ESM `moduleResolution: Bundler` / NodeNext-style output. Match this in new files.
- TS path aliases in `tsconfig.base.json` map `@kedata-indonesia/docflow-*` to package `src/` for in-repo typechecking.
- Docs (`docs/PRD.md`, `README.md`) are partly in Indonesian; the PRD is the product spec of record.

## Agent workflow (opencode)

This repo defines an orchestrator + specialist agent setup for opencode ([AGENTS.md](AGENTS.md), `.opencode/agents/*.md`): `page-layout-engineer`, `collab-engineer`, `tiptap-extender`, `bug-hunter`. Even outside opencode, the domain boundaries are a useful map of which subsystem owns what, and the verification gate (lint → typecheck → unit → build for affected packages before marking work done) is the expected bar.
