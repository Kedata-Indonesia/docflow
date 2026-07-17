# Phase 3 — `apps/web` Split (First-Party Product) · Task-Level Implementation Plan

**Roadmap ref:** [ENHANCEMENT_ROADMAP.md](../ENHANCEMENT_ROADMAP.md) Phase 3 · **Priority:** P1 · **Depends on:** Phases 1 & 2 · **Last updated:** 2026-07-17

> **Goal:** extract the real, self-hostable product into **`apps/web`** (dashboard, editor,
> sharing, folders, starred, search, auth) wired to `apps/server`, and slim **`apps/demo`**
> back to a **backend-free** library showcase (webrtc/local, `defaultPlugins`, no auth/Mongo).
> The library (`packages/*`) must keep knowing nothing about the backend.

---

## 1. Current State (`apps/demo` today is the product)

`apps/demo` is **not** a thin showcase — it is the entire first-party app, tightly coupled to
`apps/server`. Every product concern lives in the demo. The split moves the product half to
`apps/web` and leaves only the library-showcase half behind.

Full contents of [apps/demo/src](../../apps/demo/src):

| File | Role today | Verdict |
|------|-----------|---------|
| [App.vue](../../apps/demo/src/App.vue) | Auth state + provider list + login/logout + document CRUD orchestration + client folders | **Product** (mostly) |
| [api.ts](../../apps/demo/src/api.ts) | Backend client: Better Auth + `/api/documents/*` | **Product** — must not exist in showcase |
| [components/Dashboard.vue](../../apps/demo/src/components/Dashboard.vue) | Dashboard: search, folders, starred, sort, grid/list | **Product** |
| [components/DocumentCard.vue](../../apps/demo/src/components/DocumentCard.vue) | Grid card: rename/duplicate/move/delete/star | **Product** |
| [components/DocumentListRow.vue](../../apps/demo/src/components/DocumentListRow.vue) | List row variant | **Product** |
| [components/EditorView.vue](../../apps/demo/src/components/EditorView.vue) | `<DocsEditor>` host **plus** sharing, collaborators, presence, snapshot save | **Mixed** — editor host = showcase; sharing/presence/persistence = product |
| [main.ts](../../apps/demo/src/main.ts) | `registerDocsEditor()` + mount `App` | **Shared** (both apps need a bootstrap) |
| [types.ts](../../apps/demo/src/types.ts) | `DocumentItem`, `FolderItem`, `UserInfo` | **Product** (UserInfo/API mapping); DocumentItem re-usable |
| [styles/index.css](../../apps/demo/src/styles/index.css) | Tailwind entry | **Shared** |
| [vite-env.d.ts](../../apps/demo/src/vite-env.d.ts) | Vite env types | **Shared** |

**Product concerns, verified line refs (all move to `apps/web`):**

| Concern | Where |
|---------|-------|
| Auth: session check, provider list, OAuth + email/password login, logout | [App.vue:12-108](../../apps/demo/src/App.vue), UI at [App.vue:497-640](../../apps/demo/src/App.vue) |
| Document CRUD against API (list/create/open/rename/duplicate/delete/move/star) | [App.vue:134-419](../../apps/demo/src/App.vue) |
| Full backend client (auth + documents) | [api.ts:44-199](../../apps/demo/src/api.ts) |
| Sharing: link + collaborator add/lookup | [EditorView.vue:226-302](../../apps/demo/src/components/EditorView.vue), server [documents.ts:106-166](../../apps/server/src/routes/documents.ts), [users.ts:14-39](../../apps/server/src/routes/users.ts) |
| Presence heartbeat + online avatars | [EditorView.vue:163-204,338-356](../../apps/demo/src/components/EditorView.vue), server [collab.ts:36-84](../../apps/server/src/routes/collab.ts) |
| Websocket collab wiring (session identity, room `doc-<id>`) | [App.vue:120-130](../../apps/demo/src/App.vue), [EditorView.vue:70-93](../../apps/demo/src/components/EditorView.vue) |

**Showcase concern (stays in `apps/demo`, backend-free):**
- The `<DocsEditor>` host itself — `:plugins="defaultPlugins"`, `:collaboration` with the
  **webrtc fallback** already present at [EditorView.vue:84-92](../../apps/demo/src/components/EditorView.vue)
  (used whenever `COLLAB_WS_URL` is empty). This is the seed of the trimmed demo.

**Phase-1 interaction (assumed already landed):** Phase 1 removes the client snapshot/auto-save
paths from `EditorView.vue` (`saveCollabSnapshot`, `startAutoSave`, the 30s timer, the mount
`GET /api/collab/snapshot`) — [EditorView.vue:95-161](../../apps/demo/src/components/EditorView.vue) —
and retires the legacy `/api/collab/snapshot` + `/api/collab/auto-save` routes in
[collab.ts:105-168](../../apps/server/src/routes/collab.ts). **Phase 3 moves the post-Phase-1
`EditorView` (heartbeat + sharing only).** Do not re-introduce the retired persistence code.

**Phase-2 interaction (assumed already landed):** the library requires explicit webrtc signaling
(no public defaults) and exposes `onImageUpload`. `apps/web` supplies an `onImageUpload` handler
(URL-prompt fallback until Phase 4 lands the endpoint); `apps/demo` must pass an **explicit**
webrtc signaling config (or accept the library's documented local-only default).

**Server surface `apps/web` consumes (unchanged, reused):** `/api/auth/*` (Better Auth +
`/api/auth/providers` at [index.ts:59-73](../../apps/server/src/index.ts)),
`/api/documents/*` ([documents.ts](../../apps/server/src/routes/documents.ts)),
`/api/collab/heartbeat|online` ([collab.ts:36-84](../../apps/server/src/routes/collab.ts)),
`/api/users/lookup` ([users.ts](../../apps/server/src/routes/users.ts)), and the `/collab`
websocket ([index.ts:103-156](../../apps/server/src/index.ts)).

---

## 2. Target Architecture

```
 ┌──────────────────────┐        ┌──────────────────────────────┐        ┌───────────────────────────┐
 │  apps/demo (showcase) │        │   apps/web (the product)     │        │       apps/server         │
 │  backend-free         │        │                              │        │                           │
 │  ─────────────        │        │  Dashboard  Editor  Sharing  │        │  Express + Mongo(Mongoose)│
 │  <DocsEditor>         │  none  │  Folders   Starred  Search   │  HTTP  │  better-auth (OAuth +     │
 │  defaultPlugins       │◄──✗───►│  Auth (OAuth + email/pass)   │◄──────►│    email/password)        │
 │  webrtc / local only  │        │  api.ts  ─────────────────┐  │  WS    │  /api/documents /collab   │
 │  in-memory docs        │       │  <DocsEditor> + websocket │  │◄──────►│  y-websocket + CollabState│
 │  NO api / NO auth      │        │            collab         │  │        │  (Phase 1 authoritative)  │
 └───────────┬───────────┘        └────────────┬──────────────┘  │        └───────────────────────────┘
             │                                  │                 │
             └──────────────┐   ┌───────────────┘                 │
                            ▼   ▼                                  │
                 ┌───────────────────────────────┐                │
                 │  packages/*  (the library)     │                │
                 │  element → vue → core          │  ◄─ Phase-2 injection: onImageUpload,
                 │  plugins, layout-engine        │     explicit collab config; NO backend imports
                 └───────────────────────────────┘
```

**Design decisions:**

1. **`apps/web` is the product; `apps/demo` is a marketing/library demo.** They share only the
   published `packages/*` (via `workspace:*`), never each other's source. No `apps/web` file
   imports from `apps/demo` and vice-versa.
2. **Zero backend in the demo.** After the split, `apps/demo` has no `api.ts`, no auth, no fetch
   to `/api/*`, no `yjs`-server assumptions — only local/in-memory documents and webrtc (or
   single-user) collaboration. It must build and run with `pnpm dev` and **no server**.
3. **No product logic duplicated across apps.** The editor UI (toolbar, bubble menu, sidebars,
   sharing-agnostic chrome) already lives in `packages/vue`. Product-only wrappers (sharing modal,
   presence, API-backed CRUD) live **only** in `apps/web`. The demo keeps the thinnest possible
   `<DocsEditor>` host.
4. **Auth is first-class in the product.** External OAuth (Google/GitHub/Microsoft) **and** local
   email/password are both supported and documented; email/password is flipped to a first-class,
   documented option (server default reconsidered — see C3).
5. **Server is untouched functionally.** Phase 3 reuses existing routes/models; the only server
   change is the email/password default + docs (C3). New product features (folder persistence, etc.)
   are scoped conservatively (see §3 and §7).

---

## 3. Data Model

**N/A for new persistence — `apps/web` reuses the existing server models.** No new collections are
required for the core split:

- `Document` ([apps/server/src/models/Document.ts](../../apps/server/src/models/Document.ts)) —
  title, `content` (derived read-model post-Phase-1), `plainText`, `owner`, `starred`, `folderId`, `collaborators[]`.
- `CollabState` (Phase 1) — authoritative Yjs binary; `Document.content` is derived.
- Better Auth `user`/`session`/`account` collections (managed by `better-auth`).
- `Presence` (TTL) — [collab.ts:23-34](../../apps/server/src/routes/collab.ts).

**One gap to note (decision, not a blocker):** folders are currently **client-only, hardcoded**
in the demo — [App.vue:114-117](../../apps/demo/src/App.vue) seeds `Work`/`Personal`, and
`createFolder` only pushes to a local array ([App.vue:421-425](../../apps/demo/src/App.vue)) — yet
`Document.folderId` **is** persisted server-side. So documents remember their folder id, but the
folder list itself does not survive a reload. Options:
- **(recommended for this phase)** keep folders client-ephemeral in `apps/web` exactly as today
  (move the code as-is), and defer a real `Folder` model to Phase 9. Document the limitation.
- **(optional stretch)** add a minimal `Folder` model (`{ owner, name }`) + CRUD route. Only take
  this if cheap; it is **not** required to meet the Phase 3 acceptance bar.

Treat folder persistence as **out of scope by default** (see §7) unless explicitly pulled in.

---

## 4. Task Breakdown

Tasks are grouped A/B/C; each lists files, work, and acceptance. Dependencies noted as `⇐`.

### Group A — Scaffold `apps/web`

**A1. Create the `apps/web` package skeleton.** ⇐ none
- Files (new): `apps/web/package.json`, `apps/web/index.html`, `apps/web/tsconfig.json`,
  `apps/web/vite.config.ts`, `apps/web/tailwind.config.js`, `apps/web/postcss.config.js`,
  `apps/web/src/main.ts`, `apps/web/src/styles/index.css`, `apps/web/src/vite-env.d.ts`.
- Work: copy the demo's tooling as the starting point — `package.json` name
  `@kedata-indonesia/docflow-web` with the same three workspace deps (`element`, `plugins`, `vue`)
  + `yjs` + `lucide-vue-next` ([apps/demo/package.json:12-19](../../apps/demo/package.json)); mirror
  `tsconfig.json` ([apps/demo/tsconfig.json](../../apps/demo/tsconfig.json)), `tailwind.config.js`
  (scanning `apps/web/src` + `packages/vue` — [apps/demo/tailwind.config.js](../../apps/demo/tailwind.config.js)),
  and `vite.config.ts` **including the source aliases + `dedupe: ['vue','yjs']`** from
  [apps/demo/vite.config.ts](../../apps/demo/vite.config.ts). `main.ts` mirrors
  [apps/demo/src/main.ts](../../apps/demo/src/main.ts) (`registerDocsEditor()` + mount `App`).
  Add a `WEB_PORT` env (default `5174`, distinct from the demo's `5173`).
- Accept: `pnpm --filter @kedata-indonesia/docflow-web dev` boots an empty shell against Vite; no demo files referenced.

**A2. Register `apps/web` in the workspace + root scripts.** ⇐ A1
- Files: [pnpm-workspace.yaml](../../pnpm-workspace.yaml) (already globs `apps/*` — confirm no
  exclude needed), [package.json](../../package.json) root scripts.
- Work: add root scripts `"dev:web": "pnpm --filter @kedata-indonesia/docflow-web dev"` and keep
  `"dev"` = demo. Ensure `pnpm build` (`pnpm -r run build`) picks up `apps/web` (add a `build`
  script to its `package.json` mirroring the demo's `vue-tsc --noEmit && vite build`).
- Accept: `pnpm install` links `apps/web`; `pnpm dev:web` runs it; `pnpm build` builds it.

**A3. Product env + dev proxy conventions.** ⇐ A1
- Files: `apps/web/vite.config.ts`, `apps/web/.env.example` (new).
- Work: carry over the same-origin/`VITE_API_BASE_URL` proxy behavior from
  [apps/demo/vite.config.ts](../../apps/demo/vite.config.ts) (proxy `/api` + `/auth` to
  `http://localhost:3001` when `VITE_API_BASE_URL` unset). Document `VITE_API_BASE_URL` and
  `VITE_COLLAB_WEBSOCKET_URL` (resolution logic already exists at
  [EditorView.vue:13-34](../../apps/demo/src/components/EditorView.vue) — moves in B4).
- Accept: with `pnpm dev:server` running, `apps/web` reaches `/api/auth/providers` through the proxy.

### Group B — Move the product out of `apps/demo` into `apps/web`

> All of Group B is **move + adapt**, not rewrite. Preserve behavior; only change import paths and
> the app they live in. Nothing here should touch `packages/*` or `apps/server` logic.

**B1. Move the backend client.** ⇐ A1
- Files: `apps/web/src/api.ts` (new, from [apps/demo/src/api.ts](../../apps/demo/src/api.ts)); `apps/web/src/types.ts` (from [types.ts](../../apps/demo/src/types.ts)).
- Work: move `api.ts` verbatim (auth + documents client). Keep `RateLimitError`, `getAuthProviders`,
  `signInWithProvider`, `signUp/InWithEmail`, `signOut`, and the document CRUD functions.
- Accept: `apps/web` typechecks importing `./api.js`; no copy of `api.ts` remains in the demo (removed in C2).

**B2. Move the app shell / orchestration.** ⇐ B1
- Files: `apps/web/src/App.vue` (from [apps/demo/src/App.vue](../../apps/demo/src/App.vue)).
- Work: move the whole authenticated app: auth state + `checkAuth`/`loadProviders`/`handleLogin`/
  `handleEmailSubmit`/`handleLogout` ([App.vue:12-108](../../apps/demo/src/App.vue)), document CRUD
  ([App.vue:134-419](../../apps/demo/src/App.vue)), collab identity ([App.vue:120-130](../../apps/demo/src/App.vue)),
  URL routing/`popstate` ([App.vue:429-467](../../apps/demo/src/App.vue)), and the full login screen +
  authenticated header template ([App.vue:478-782](../../apps/demo/src/App.vue)). Fix relative imports.
- Accept: logging in, listing, creating, opening, renaming, deleting, starring, moving all work against a running server.

**B3. Move the dashboard components.** ⇐ B2
- Files: `apps/web/src/components/{Dashboard,DocumentCard,DocumentListRow}.vue` (from the demo's
  [components/](../../apps/demo/src/components/)).
- Work: move verbatim; retarget `../types.js` import. These are pure product UI (search/folder/
  starred/sort/grid-list — [Dashboard.vue:50-97](../../apps/demo/src/components/Dashboard.vue)).
- Accept: dashboard renders in `apps/web`; search, folder filter, starred filter, sort, grid/list toggle all work.

**B4. Move the product editor host (sharing + presence + websocket collab).** ⇐ B2
- Files: `apps/web/src/components/EditorView.vue` (from the **post-Phase-1**
  [EditorView.vue](../../apps/demo/src/components/EditorView.vue)).
- Work: move the `<DocsEditor>` host together with the **product-only** pieces: websocket collab
  resolution ([EditorView.vue:13-93](../../apps/demo/src/components/EditorView.vue)), sharing modal +
  collaborator add/lookup ([EditorView.vue:226-302,369-457](../../apps/demo/src/components/EditorView.vue)),
  presence heartbeat + online avatars ([EditorView.vue:163-204,338-356](../../apps/demo/src/components/EditorView.vue)).
  Wire the Phase-2 `onImageUpload` prop (URL-prompt fallback until Phase 4). **Do not** carry the
  Phase-1-removed snapshot/auto-save code.
- Accept: two `apps/web` clients in the same doc collaborate over the server websocket; sharing adds
  a collaborator by email; online avatars appear; no `/api/collab/snapshot` calls in the network tab.

**B5. Auth UI parity (OAuth + email/password).** ⇐ B2, C3
- Files: `apps/web/src/App.vue` (login screen, already moved in B2).
- Work: verify the moved login screen renders all enabled providers from
  [App.vue:513-638](../../apps/demo/src/App.vue) — Google/GitHub/Microsoft social buttons **and** the
  email/password form (sign-in/sign-up toggle). Ensure the email/password branch is visible whenever
  the server reports a `credentials` provider ([App.vue:570](../../apps/demo/src/App.vue)); this
  depends on C3 flipping the server default so it actually appears.
- Accept: with `EMAIL_PASSWORD_ENABLED=true` + one OAuth provider configured, the login screen shows
  both; email sign-up then sign-in works; OAuth round-trip works.

### Group C — Slim `apps/demo`, polish auth, and update workspace/tests/docs

**C1. Replace the demo with a backend-free showcase shell.** ⇐ A1 (independent of B; can parallel)
- Files: `apps/demo/src/App.vue` (rewrite to a thin showcase), `apps/demo/src/components/EditorView.vue`
  (trim to the pure `<DocsEditor>` host), `apps/demo/src/types.ts` (reduce to `DocumentItem`).
- Work: reduce the demo to: an in-memory document (or a tiny local template picker) rendered by
  `<DocsEditor :plugins="defaultPlugins">` with **webrtc/local** collaboration only — reuse the
  existing webrtc fallback branch at [EditorView.vue:84-92](../../apps/demo/src/components/EditorView.vue)
  and pass an **explicit** Phase-2 signaling config. Remove auth, dashboard-vs-editor gating tied to
  login, and all `/api/*` calls. Keep the theme toggle and `defaultPlugins` demonstration. Keep the
  demo genuinely useful to a library consumer (shows how to mount `<docs-editor>`/`<DocsEditor>`).
- Accept: `pnpm dev` runs the demo with **no** server; editing works; no network calls to `/api`; webrtc collab is P2P/local only.

**C2. Strip backend surface + deps from the demo.** ⇐ C1
- Files: delete `apps/demo/src/api.ts`; delete `apps/demo/src/components/{Dashboard,DocumentCard,DocumentListRow}.vue`
  (moved to web); edit `apps/demo/vite.config.ts` (drop the `/api` + `/auth` proxy); edit `apps/demo/package.json`.
- Work: remove the API client, dashboard, sharing, heartbeat, snapshot code from the demo. Drop the
  dev proxy ([apps/demo/vite.config.ts](../../apps/demo/vite.config.ts)). Prune any now-unused deps.
  Keep `yjs` only if webrtc collab still needs it (it does — keep). Ensure `noUnusedLocals` passes.
- Accept: `grep -r "/api/" apps/demo/src` returns nothing; `grep -r "api.js\|fetch(" apps/demo/src` is clean; demo typechecks and builds.

**C3. Make email/password first-class on the server + document it.** ⇐ none (server-side; enables B5)
- Files: [apps/server/src/config.ts](../../apps/server/src/config.ts),
  [docker/server.env.example](../../docker/server.env.example), [.env.docker.example](../../.env.docker.example),
  [docs/DEPLOYMENT.md](../DEPLOYMENT.md).
- Work: email/password is currently **off by default** — `EMAIL_PASSWORD_ENABLED === 'true'` gate at
  [config.ts:19-22](../../apps/server/src/config.ts), consumed by [auth.ts:49-52,86](../../apps/server/src/auth.ts)
  and surfaced by [routes/auth.ts:9](../../apps/server/src/routes/auth.ts) / [index.ts:60-61](../../apps/server/src/index.ts).
  Make it first-class: document it prominently, ship it enabled in the product `.env.example`s, and
  (decision) consider flipping the default to `true` for the self-hosted product profile while
  keeping it env-overridable. Document the `username` plugin behavior ([auth.ts:49-52](../../apps/server/src/auth.ts))
  and `EMAIL_VERIFICATION_REQUIRED`.
- Accept: a fresh product `.env` from the example yields a login screen with the email/password form present; docs describe enabling all four methods.

**C4. Update Playwright for the two-app world.** ⇐ A2, B4, C1
- Files: [playwright.config.ts](../../playwright.config.ts), [playwright.docker.config.ts](../../playwright.docker.config.ts), `e2e/*`.
- Work: today the config boots the **demo** dev server and points `baseURL` at it
  ([playwright.config.ts:12-27](../../playwright.config.ts)). Split responsibilities:
  - **Showcase specs** (library behaviors: pagination, page-break — [e2e/page-break.spec.ts](../../e2e/page-break.spec.ts))
    run against `apps/demo` (no backend).
  - **Product specs** ([e2e/collaboration.spec.ts](../../e2e/collaboration.spec.ts) and new
    dashboard/auth/sharing specs) run against `apps/web` **with `apps/server` up**. Add a second
    `webServer` entry (or a project with its own `baseURL` = `WEB_PORT`) and a login/seed step
    (email/password test user) so product specs can authenticate.
  - Read `WEB_PORT` the way `DEMO_PORT` is read today ([playwright.config.ts:5-7](../../playwright.config.ts)).
- Accept: `pnpm test:e2e` runs showcase specs against the demo and product specs against web+server; both green.

**C5. Update Docker/deployment to build `apps/web` as the product.** ⇐ B*, C1
- Files: [docker/docker-compose.yml](../../docker/docker-compose.yml), [Dockerfile.demo](../../Dockerfile.demo)/[docker/Dockerfile.demo](../../docker/Dockerfile.demo),
  [docker/entrypoint.demo.sh](../../docker/entrypoint.demo.sh), [docker/nginx.conf](../../docker/nginx.conf),
  [docker/demo.env.example](../../docker/demo.env.example), [docs/DEPLOYMENT.md](../DEPLOYMENT.md), [docs/INTEGRATION.md](../INTEGRATION.md).
- Work: the deployment currently builds/serves `apps/demo` as the app (compose + nginx +
  `Dockerfile.demo`). Introduce a `Dockerfile.web` + compose service that builds `apps/web` and is
  the **default served frontend**; nginx proxies `/api/*` and `/collab` to the server (same-domain
  mode). Keep the demo build **optional** (a separate static showcase target). Rename env examples
  accordingly (`web.env.example`).
- Accept: `docker compose up` serves `apps/web` (the product) with working auth + collab against the server; demo is not required for a product deploy.

**C6. Update architecture docs.** ⇐ all
- Files: [CLAUDE.md](../../CLAUDE.md), [docs/PRD.md](../PRD.md), [docs/README.md](../README.md).
- Work: correct the "Apps" section of [CLAUDE.md:73-78](../../CLAUDE.md) to describe `apps/demo` as a
  backend-free showcase and `apps/web` as the product wired to `apps/server`; note the boundary rule
  (no cross-app imports). Update `pnpm dev` vs `pnpm dev:web` guidance in [CLAUDE.md:7-21](../../CLAUDE.md).
- Accept: docs match the shipped structure; a new contributor can tell demo from product.

---

## 5. Sequencing

```
A1 ─► A2 ─► A3
 │
 └─► B1 ─► B2 ─┬─► B3
               ├─► B4
               └─► B5 ◄─ C3
A1 ─► C1 ─► C2                (demo slimming — parallel to B)
C3 (server, independent) ─► B5
A2,B4,C1 ─► C4
B*,C1 ─► C5
all ─► C6
```

Land **A (scaffold) → B1–B4 (move product) → verify web works against server** first — that proves
the product half. **C3** (email/password) can start immediately in parallel (server-only) and unblocks
**B5**. Slim the demo (**C1–C2**) in parallel with B. Do **C4/C5/C6** last, once both apps run.
Keep `apps/demo` working at every step (never delete demo product code until its `apps/web` twin is verified).

## 6. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| **Product logic duplicated across demo + web** (two diverging editor hosts) | Editor UI lives in `packages/vue`; the demo keeps only the thinnest `<DocsEditor>` host, all product wrappers (sharing/presence/CRUD) live **only** in `apps/web`. Enforce: no `apps/demo` file imports auth/api/sharing (grep gate in C2). |
| **Demo stops being dependency-light** (drags in server assumptions) | C2 deletes `api.ts` + dashboard + proxy and prunes deps; acceptance greps for `/api/` and `fetch(`. Demo must run with `pnpm dev` and no server. |
| **Cross-app import creep** (`apps/web` ↔ `apps/demo`) | Apps share only `packages/*` via `workspace:*`. Add a lint/CI check forbidding `apps/web`↔`apps/demo` imports (mirrors the Phase-0 `packages/*` guard). |
| **Phase 1/2 not actually landed** when Phase 3 starts | Phase 3 depends on both. If the moved `EditorView` still has snapshot/auto-save or public webrtc defaults, stop and finish 1/2 first — do not re-add removed code. |
| **Email/password invisible after split** (default off) | C3 flips/documents the default and ships it enabled in the product `.env.example`; B5 verifies the form renders. |
| **Playwright can't authenticate product specs** | C4 adds a seeded email/password test user + login step and a web+server `webServer`; showcase specs stay backend-free against the demo. |
| **Folders silently lost on reload** (client-only today) | Documented as a known limitation; either keep ephemeral (recommended) or add a minimal `Folder` model. Not a hidden regression — it already behaves this way in the demo (§3). |
| **Deployment breaks** (compose still points at demo) | C5 introduces a `Dockerfile.web` + default web service, keeps the demo as an optional target, and re-verifies `docker compose up`. |
| **Port/env collisions** between demo (5173) and web (5174) | Distinct `DEMO_PORT`/`WEB_PORT`; Playwright reads each; docs updated (C6). |

## 7. Out of Scope (this phase)

- **New product features** — export (Phase 5), citations (Phase 6), AI (Phase 7), image/asset storage
  (Phase 4; `apps/web` only wires the `onImageUpload` prop with a URL-prompt fallback here).
- **Server-persisted folders / a `Folder` model** — folders stay client-ephemeral as today unless the
  cheap optional model in §3 is explicitly pulled in; full folder management is Phase 9.
- **New server routes or auth providers** — only the email/password default + docs change (C3);
  enterprise SSO (SAML/OIDC/LDAP) remains out of scope.
- **Multi-instance collab scaling** and **Yjs persistence changes** — owned by Phase 1.
- **Turn-key on-prem packaging polish** beyond making compose build `apps/web` (Phase 8).
