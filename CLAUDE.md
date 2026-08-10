# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> The project root is this `docflow/` directory (it holds the git repo, `package.json`, and `pnpm-workspace.yaml`). Run all commands from here.

## Commands

Package manager is **pnpm** (>=9, Node >=20). Run from the repo root:

```bash
pnpm install
pnpm build            # build all packages (pnpm -r run build)
pnpm dev              # run the demo app (apps/demo, backend-free library showcase)
pnpm dev:web          # run the product app (apps/web, needs dev:server)
pnpm dev:server       # run the collaboration/API server (apps/server, tsx watch)
pnpm typecheck        # tsc/vue-tsc --noEmit across all packages
pnpm test:unit        # vitest run across all packages
pnpm lint             # eslint . --ext .ts,.vue
pnpm test:e2e         # Playwright (auto-starts the demo dev server)
pnpm test:visual      # Percy + Playwright visual snapshots
```

Scope work to one package/app instead of running everything:

```bash
pnpm --filter @kedata-indonesia/docflow-core test:unit
pnpm --filter @kedata-indonesia/docflow-vue typecheck
```

Run a single unit test (vitest) inside a package directory:

```bash
cd packages/core && pnpm vitest run src/__tests__/Editor.test.ts
cd packages/core && pnpm vitest run -t "test name substring"
```

Run a single e2e spec:

```bash
pnpm exec playwright test e2e/page-break.spec.ts
```

After any non-trivial change, verify with the affected package's `typecheck` + `test:unit`, and `test:e2e` if editor UI/layout changed. `noUnusedLocals`/`noUnusedParameters` are on, so typecheck fails on dead bindings.

## Architecture

A pnpm workspace publishing a **framework-agnostic rich-text editor with page pagination and Yjs collaboration** as five layered npm packages (`@kedata-indonesia/docflow-*`), plus three apps (web product + demo showcase + server). Built on TipTap / ProseMirror.

### Layering (dependencies flow downward)

```
element (Web Component) ─┐
                         ├─→ vue (Vue 3 components + composables) ─→ core (headless factory)
plugins ─────────────────┴──────────────────────────────────────────┘   ↑
layout-engine (pagination measurement) ──────────────────────────────────┘
```

- **`packages/core`** — the headless heart. `createEditor()` ([Editor.ts](packages/core/src/Editor.ts)) builds a TipTap editor from a base StarterKit + `TextStyle` + `BlockAttributesExtension` + `PaginationPlus` (from `tiptap-pagination-plus`) + plugin extensions. It also owns `PluginSystem.ts` (the `DocsEditorPlugin` contract) and `Collaboration.ts` (Yjs setup).
- **`packages/plugins`** — built-in features (headings, lists, table, image, link, alignment, code block, fontSize, pageBreak, slashMenu, footnote, …) each authored as a `DocsEditorPlugin`. Exported together as `defaultPlugins`.
- **`packages/layout-engine`** — pure measurement/pagination: `PageLayout` measures rendered block DOM (via `ResizeObserver`, debounced, with a shadow-DOM measuring pass) and `PageBreaker` computes where A4/Letter pages split. Framework-agnostic; consumed by the Vue layer to render page views.
- **`packages/vue`** — Vue 3 `<DocsEditor>` component, `useEditor` composable, and UI (toolbar, bubble menu, slash menu, rulers, sidebars). This is where the headless editor + layout engine are wired into a Google-Docs-like UI.
- **`packages/element`** — wraps the Vue component as a `<docs-editor>` Web Component with a shadow DOM (`shadow.css`) for use in any framework.

### Core design invariants

- **ProseMirror state is the single source of truth.** Page layout and collaboration are *derived views* — never a second editable model. When changing editor behavior, mutate via ProseMirror/TipTap commands; let layout and collab react.
- **The plugin contract** (`DocsEditorPlugin` in [PluginSystem.ts](packages/core/src/PluginSystem.ts)): a plugin contributes `tiptapExtensions`, `toolbar` items, `slashCommands`, `commands` (custom command implementations), and `hooks` (`onInit`/`onDestroy`). `createActionMap` resolves toolbar/slash actions to either a plugin's custom command or a native TipTap command. Add editor features as plugins, not by hardcoding extensions into `core`.
- **Extension-name collisions:** because Vite may load a module more than once, extensions that could double-register (e.g. FontSize) are registered *only* via their plugin, not also in `Editor.ts`. Watch for duplicate-name errors when adding extensions.
- **`createEditor` rebuilds the whole TipTap editor** when `.use(plugin)` is called at runtime (`rebuildEditor` preserves JSON + selection). Adding a plugin is a full teardown/recreate, not a hot patch.
- **Collaboration** ([Collaboration.ts](packages/core/src/Collaboration.ts)): when `collaboration` is set, StarterKit history is disabled and the TipTap `Collaboration`/`CollaborationCursor` extensions bind to a `Y.Doc`. Providers are `webrtc` (zero-config P2P) or `websocket` (requires `websocketUrl`, backed by the server). Yjs/webrtc/websocket are optional peer deps. In collab mode the Yjs doc is authoritative — `createEditor` never seeds the room from `content`; hosts seed via `initialStorageState` or the server's guarded `POST /api/collab/seed` flow. Production topology: `websocket` + your own `websocketUrl` (no external calls). webrtc without explicit `signaling` is localhost-only and warns once — public signaling defaults were removed in Phase 2.
- **Content migration:** `migrateContent` in `Editor.ts` flattens legacy `page`-wrapped and `tabbed-doc` documents on load. Preserve this when touching content ingestion.
- **Library boundary:** never import backend concerns into `packages/*`. Persistence, auth, storage, and AI are the host app's job, reached only through the injection ports catalogued in [docs/LIBRARY_CONTRACT.md](docs/LIBRARY_CONTRACT.md) (`onUpdate`, `collaboration`, `onImageUpload`; export hooks planned). A PR that touches both `packages/*` and `apps/*` for a single concern is a smell.

### Apps

- **`apps/web`** — the **self-hostable product** (Phase 3): auth (OAuth + email/password), dashboard (search/folders/starred), document CRUD, sharing/collaborators, presence, websocket collab, and the editor host wired to `apps/server` via `api.ts`. Consumes the published packages via workspace links. Runs on `WEB_PORT` (5174).
- **`apps/demo`** — the **backend-free library showcase** (Phase 3): a thin `<DocsEditor>` host with `defaultPlugins`, in-memory documents, and webrtc (P2P/local) collab only. No auth, no `api.ts`, no `/api/*` calls — runs with `pnpm dev` and no server. This is the reference for library consumers.
- **`apps/server`** — Express + MongoDB (Mongoose) + `better-auth` API and the Yjs **websocket collaboration** backend. [index.ts](apps/server/src/index.ts) mounts a `ws` `WebSocketServer` alongside HTTP; `setupWSConnection` comes from the vendored CommonJS `src/y-websocket/*.cjs` (copied into `dist/` by the build `postbuild` step). Routes: `documents`, `collab`, `users`, `assets`, auth. Auth supports Google/GitHub/Microsoft OAuth + email/password (enabled by default; `EMAIL_PASSWORD_ENABLED=false` disables); session strategy is cookie or JWT. Config is env-driven ([config.ts](apps/server/src/config.ts)).
  - **Collab persistence (Phase 1):** the Yjs doc is the single source of truth, persisted server-side to the `CollabState` collection ([mongoPersistence.ts](apps/server/src/y-websocket/mongoPersistence.ts), debounced + flush on last disconnect). `Document.content`/`plainText` are a **derived read-model** written only by the server for collab docs (dashboard list, search, export). Legacy JSON-only docs migrate via the guarded, one-time `POST /api/collab/seed`. Solo (non-collab) docs still persist client-side via `onUpdate` → `PUT /api/documents/:id`.
  - **Asset storage (Phase 4):** image uploads go through `POST /api/assets` (multer + magic-byte MIME validation) into an env-selected `StorageAdapter` ([storage/](apps/server/src/storage)) — `s3` (MinIO/S3-compatible, production target) or `gridfs` (Mongo, single-container default). Bytes are served back through `GET /api/assets/:id` with auth enforced server-side — no public bucket, no CDN. The library reaches this only via the Phase 2 `onImageUpload` port.
  - Note the room-id handling: websocket `roomId` has a `doc-` prefix stripped before document access checks — relevant when debugging collab access.

### Deployment

Dockerfiles and compose live at the repo **root**: `Dockerfile.{server,web,demo}` (canonical, used by both Dokploy and compose) and `docker-compose.yml` / `docker-compose.dev.yml` / `docker-compose.deploy.yml`. Supporting infra files (nginx configs, entrypoints, `.npmrc`, env examples, `mongo-init.js`) live in `docker/`. Two modes: **same-domain** (nginx proxies `/api/*` to server, serves web/demo statically) and **separate-domain** (frontend and API on different hosts, requiring cross-domain OAuth/cookie config).

**Live reference deploy:** `https://dev-docflow.kedata.cloud/` runs the same-domain stack on Dokploy (web + server containers behind a host nginx), using **managed MongoDB Atlas**, **external S3-compatible storage**, and the **cloud AI provider** (`AI_PROVIDER=openai-compatible` → DeepSeek). The compose-managed path (Mongo + MinIO + local LLM container) lives in the *pure on-prem* backlog — not exercised by the current prod profile.

Full guides: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) (operator-facing, both modes, env reference §3, backup/restore §11, upgrade §12) and [docs/AI_PROVIDERS.md](docs/AI_PROVIDERS.md) (per-provider env config + compat matrix for the OpenAI-compatible adapter).

### AI assistance (Phase 7)

- **Flow:** browser → `apps/web` host → `apps/server` → LLM. The browser never holds an API key; all `claude`/`openai-compatible` calls are proxied through `/api/ai/*`.
- **Plugin vs provider split:** the library ships `aiPlugin` + `AIStreamFn`/`AIDraftFn` port types in [`packages/plugins/src/ai.ts`](packages/plugins/src/ai.ts) and [`packages/core/src/ai/types.ts`](packages/core/src/ai/types.ts). The library knows nothing about URLs, keys, or models — the host app (`apps/web/src/ai/aiStream.ts`, `aiDraft.ts`) injects transports that POST to the server. A provider swap is purely env config on the server (`AI_PROVIDER=claude|openai-compatible`), no code change.
- **Library boundary:** `packages/*` may never import from `apps/*` or call an LLM URL directly — the same `no-restricted-imports` guardrail from §Library boundary covers AI dependencies (`aiLimiter` is server-only).
- **Streaming safety invariant:** during a stream, only **meta-only** ProseMirror transactions fire (decorations accumulate the preview text). The doc is mutated in **exactly one** transaction on accept (`aiAccept` → `tr.replaceWith` → flows through Yjs to peers like a human edit). Streaming NEVER churns the CRDT — verified by the collab-safety E2E (`e2e/product/ai.collab-safety.spec.ts`) and unit-test `packages/plugins/src/__tests__/ai.test.ts` (`countDocChanges`).
- **RAG drafting (Phase 7E):** the `Draft with citations` sidebar action POSTs to `/api/ai/draft`; the server embeds the prompt, `$vectorSearch`-es the owner's reference library (owner ∪ shared-with-me), and streams an LLM reply carrying `[n]` markers + a terminal `done` event with a `{ ref, sourceId, label }` table. Insert maps markers → Phase 6 citation nodes in **one** dispatch (§2 decision 6: never N dispatches for N markers). Untrusted model output can never reach the doc as a raw `sourceId` — only markers that resolve through the server-owned table become citations.
- **Config (Phase 7F-1):** see `docker/server.env.example` — `AI_PROVIDER`, `AI_BASE_URL`, `AI_MODEL` / `AI_FAST_MODEL` / `AI_HEAVY_MODEL`, `AI_API_KEY`, `AI_MAX_TOKENS`, `AI_LOG_PROMPTS` (off by default), `RATE_LIMIT_AI_MAX`, and `AI_EMBED_*` / `AI_RAG_VECTOR_BACKEND`. The example ships commented Claude + Ollama deployment shapes.
- **Privacy:** `AI_LOG_PROMPTS=false` by default (server only logs `{ action }`); turning it on logs full prompts + completions and emits a boot warning. Local provider + logging off = no document content leaves the network — invariant asserted by the privacy E2E (`e2e/product/ai.privacy.spec.ts`).

## Conventions

- **Publishing:** packages ship to GitHub Packages (`npm.pkg.github.com`) under `@kedata-indonesia`. Internal deps use `workspace:*`. See [docs/PUBLISH.md](docs/PUBLISH.md).
- **Build tooling:** leaf/headless packages build with `tsup` (esm+cjs+dts); Vue/element packages build with `vite` + `vue-tsc` for declarations.
- **Intra-source imports use `.js` extensions** (e.g. `import ... from './PluginSystem.js'`) even for TS files — required by ESM `moduleResolution: Bundler` / NodeNext-style output. Match this in new files.
- TS path aliases in `tsconfig.base.json` map `@kedata-indonesia/docflow-*` to package `src/` for in-repo typechecking.
- Docs (`docs/PRD.md`, `README.md`) are partly in Indonesian; the PRD is the product spec of record.

## Agent workflow (opencode)

This repo defines an orchestrator + specialist agent setup for opencode ([AGENTS.md](AGENTS.md), `.opencode/agents/*.md`): `page-layout-engineer`, `collab-engineer`, `tiptap-extender`, `bug-hunter`. Even outside opencode, the domain boundaries are a useful map of which subsystem owns what, and the verification gate (lint → typecheck → unit → e2e → build for affected packages before marking work done) is the expected bar.
