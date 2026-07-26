# Sprint 9-10 Execution Plan — Deployment + Collaboration 

**Sprint window:** Weeks 9–10 (≈2 sprints)
**Roadmap refs:** [`github-issues-execution-order.md`](github-issues-execution-order.md) §Sprint 9-10
**Plan refs:** [`phase-8-deployment-packaging.md`](phase-8-deployment-packaging.md), [`phase-9-google-docs-parity.md`](phase-9-google-docs-parity.md)
**GitHub issues:** #41 Phase 8, #42 Phase 9, #32 Comments (P9-4), #31 Track Changes (P9-8)
**Last updated:** 2026-07-26
**Status:** ready for sprint planning. Acceptance gates mirror §5 of each phase plan. Post-deploy-context update: A2/A4/A6 confirmed live in prod at `dev-docflow.kedata.cloud`; A3/B2 downscoped to "pure on-prem" backlog.

**2026-07-26 update:** A1, A5, C1, C2, C3 shipped (PR #83, #85, #86). A3/4 latency fix shipped in #84. B1 verified in prod. A6 verified in prod (live cold start).

**2026-07-26 update (2):** B2-r1/r2/r3 shipped (PR #88) — provider-agnostic AI compat matrix with 38 unit tests + `docs/AI_PROVIDERS.md`. C4 shipped (PR #89) — `GenflowAi.md` §Deployment now lists the prod stack + links to operator-facing docs.

**2026-07-26 update (3):** D1 shipped (PR #90) — proprietary LICENSE + NOTICE + `license: "UNLICENSED"` across all 11 package.jsons + README badge + license pointer. D2 is **folded into D1** — the third-party license surface lives in the dedicated `NOTICE` file plus the on-prem compose notes in `DEPLOYMENT.md` §2; no further code change needed. Status table below reflects this. **Phase 8 is functionally complete**: only license *enforcement* (tier caps, signed file, audit log) and A6 live verification remain — both deferred to Sprint 11+.

**2026-07-26 update (4):** T1 + T2 shipped (PR #92) — live TOC sidebar (debounced refresh + active-heading tracking via `selectionUpdate`) + mount through unified `activeSidebar` (dropped dead `leftSidebarOpen` toggle). The `activeSidebar` mount pattern is now consistent across TOC / References / AI / Comments / History.

**2026-07-27 update:** PR1 + PR2 library side shipped (PR #94). `AwarenessState.present: boolean` flag + `createCollaboration({ emitCursor })` option + `setLocalCursorEnabled()` / `isLocalCursorEnabled()` helpers expose the presence gate at the library level. Peer-leave propagates within one awareness round-trip (no REST 15s lag).

**2026-07-27 update (2):** PR1 + PR2 **host wiring** shipped (PR #95). `apps/web/src/components/EditorView.vue` now:
- Subscribes to `onAwarenessChange` via the new `awarenessStates` ref.
- Replaces the REST-driven avatar stack with the awareness-driven `presentPeers` derived view (filters `present: true` + excludes the local clientId). Peer-leave is instant.
- Calls `setLocalCursorEnabled(false)` on route unmount + on `document.visibilitychange` (tab switch / minimize). The REST 15s heartbeat is kept for the menu UI metadata only.

**2026-07-28 update:** **RO1 + RO2 + RO3 atomic block** shipped (PR #96). The Phase 9 role model is now enforced end-to-end:
- `DocRole` (`viewer` / `commenter` / `editor`) + `Document.roles` subdoc + legacy `collaborators` back-compat (legacy grants implicit `editor`).
- HTTP: `canRead` / `canMutate` / `canComment` replace the old boolean checks in `routes/documents.ts`. New `GET /:id/access` (caller's role + capabilities), `PUT /:id/roles`, `DELETE /:id/roles/:userId`.
- WS: `utils/roomAccess.ts` returns `{ role, isOwner }`. Viewer / commenter get `setupReadOnlyWSConnection` (drops inbound `MESSAGE_SYNC` at the ws layer; awareness still flows). Editor / owner get the normal `setupWSConnection`.
- Idempotent migration runs at boot, lifting legacy `collaborators` entries into `roles` with `editor` parity.
- 15 new tests pin: 9 role helpers + migration, 6 read-only WS gate.
The RO3 security gate is closed end-to-end. Phase 9 is unblocked for V (versioning) + C (comments) + SG (suggestions).

> **Live deployment context (2026-07-26):** the product is already running in the cloud at
> `https://dev-docflow.kedata.cloud/` on a same-domain nginx reverse proxy. Stack: managed
> MongoDB (Atlas), external S3-compatible storage, cloud AI provider (`openai-compatible` →
> DeepSeek). This means several P8 sub-tasks planned as self-hosted defaults are **already
> exercised in prod** via the managed path — they don't need on-prem containers, only the
> end-to-end verification the C-tasks already demand. See §2 status column "(prod)".

---

## 1. Goal

Two things ship by end of Sprint 10:

1. **A clean machine runs the full product from `docker compose up` following the docs alone.** (Phase 8 acceptance gate.)
2. **Google-Docs-class collaboration primitives:** roles-gated comments, version history, and the live TOC / presence polish that make them feel real. (Phase 9 §1 + §4.)

This document does **not** duplicate either phase plan. It pins the **current-vs-target** state for every sub-task, the **order they should land in**, and the **acceptance gates** that decide done. Read this with both phase plans open.

---

## 2. Phase 8 — Current State Assessment

Verified against `main` @ `54ebab7` plus the **live deployment at `https://dev-docflow.kedata.cloud/`**.

Legend:
- 🟢 **shipped (prod)** — confirmed running in the cloud deploy
- ✅ **done (code)** — complete in tree, not yet verified in prod
- ⚠️ **partial** — partially complete
- ❌ **missing** — not yet built
- 🔵 **deferred by design** — the on-prem default is satisfied in prod via managed services (Atlas, external S3); still needed if a customer wants pure self-hosted

| # | Task | State | Gap / file pointer | Acceptance gate |
|---|------|-------|--------------------|-----------------|
| **A1** | Consolidate Dockerfile set | ✅ | PR #83. Compose points exclusively at `docker/Dockerfile.*`. Root variants retained intentionally as Dokploy legacy targets (A1 follow-up). | Exactly one server + one frontend Dockerfile path for compose; `grep` finds no references to removed files; `DEPLOYMENT.md` records the canonical location. |
| **A2** | `apps/web` image | 🟢 | `Dockerfile.web` + `web` service in compose. Confirmed live at `dev-docflow.kedata.cloud/`. | `docker compose build web` succeeds; `VITE_API_BASE_URL`/`VITE_COLLAB_WEBSOCKET_URL` build args honoured. ✅ in prod. |
| **A3** | Self-hosted Mongo + MinIO | 🔵 | Prod uses **Atlas** + **external S3**; the compose `mongo`+`minio` blocks remain commented (`docker/docker-compose.yml:76-133`). Self-host path is the "pure on-prem" customer profile. | `docker compose up` starts `web+server+mongo+minio` all healthy; volumes persist across `down`/`up`. Managed path already exercised in prod. |
| **A4** | `mongo-init.js` schema fix | ✅ | PR #84. `users.googleId` is now sparse+unique; `collabstates` + `sources` + `sourcechunks` + `documents.deletedAt` indexes added; legacy `collabsnapshots` dropped. Pinned by 8 unit tests in `apps/server/src/__tests__/mongoInit.spec.ts`. | Fresh Mongo: email/password user created without duplicate-key error; collab doc created without index error. |
| **A5** | Consolidated env template | ✅ | PR #84 (completeness) + PR #85 (placeholder hygiene). `docker/server.env.example` + `docker/demo.env.example` + `apps/demo/.env.example` + `.env.docker.example` are aligned; no production concrete values. | Copy `.env.docker.example` → `.env.docker` + fill secrets = working same-domain stack, no other edits. |
| **A6** | Healthchecks + startup order | ✅ | Server healthcheck + `depends_on: service_healthy` + `entrypoint.sh` wait-for-Mongo. Confirmed live (SPA + backend responsive at `dev-docflow.kedata.cloud`). | Cold start reaches all-healthy without manual restart. ✅ in prod. |
| **B1** | AI env in compose + server env | ✅ | `config.ts:46-71` reads `AI_*` (7F-1). Documented in `docker/server.env.example` + `.env.docker.example` + `DEPLOYMENT.md` §3.4 + §7. Prod runs `openai-compatible` → DeepSeek. | `AI_PROVIDER=claude` works; switch to local preset works, env-only, no rebuild. ✅ in prod (openai-compatible → DeepSeek). |
| **B2-r1** | Compat test suite (fixtures) | ✅ #88 | PR #88. `apps/server/src/ai/__tests__/openaiCompat.spec.ts` (NEW, 21 tests): happy-path + error-path fixtures for DeepSeek / OpenAI / Ollama / vLLM / LM Studio / OpenRouter. | Each provider in the matrix (DeepSeek, OpenAI, Ollama, vLLM, LM Studio, OpenRouter) has a recorded happy-path + an error-path fixture that the OpenAI-compatible adapter must normalize correctly. |
| **B2-r2** | Compat matrix docs | ✅ #88 | PR #88. `docs/AI_PROVIDERS.md` (NEW, 146 lines) — provider matrix + per-provider env config + per-provider quirks + recipe for adding a new provider. Linked from `DEPLOYMENT.md` §7. | A `docs/AI_PROVIDERS.md` documents (a) the matrix of supported providers, (b) the per-provider env config, (c) known quirks (e.g. DeepSeek's `finish_reason: 'tool_calls'` vs OpenAI's `finish_reason: 'stop'`). Linked from `DEPLOYMENT.md` §7. |
| **B2-r3** | Streaming edge-case tests | ✅ #88 | PR #88. `apps/server/src/ai/__tests__/openaiCompatEdges.spec.ts` (NEW, 17 tests): empty choices, double done, missing `[DONE]`, multi-byte UTF-8 chunks, abort mid-stream, response-body edge cases, parser-level edge cases. | Each edge case pinned by a unit test in `apps/server/src/ai/__tests__/openaiCompatEdges.spec.ts`. |
| **B2-c** | Local-LLM compose profile | 🔵 backlog | No `llm` service, no `profiles: [local-llm]`, no GPU override. Cloud-AI customers (current prod) don't need it; pure on-prem + privacy-strict customers do. | `docker compose --profile local-llm up` starts model server; local preset AI action completes with no egress (asserted by privacy test from 7F-3). |
| **B3** | GPU / hardware doc | ✅ | `DEPLOYMENT.md` §7 documents Claude vs DeepSeek vs local-Ollama/vLLM options. NVIDIA Container Toolkit + GPU sizing is the next thing to add — but only relevant once B2 is built. | Reader can pick Claude vs cloud openai-compatible vs local; specifics of GPU/VRAM sizing deferred to B2. |
| **C1** | Re-point DEPLOYMENT.md to product | ✅ | PR #86. §1 topology (same-domain + separate-domain), §2 quickstart on clean machine, §9 run pointing at `docker/docker-compose.yml`, §14 local dev uses `apps/web` + `apps/server`. All examples use `docs.example.com` / `api.example.com`. | Same-domain quickstart on clean machine → working login + collab edit. ✅ in prod since A6; doc now captures it. |
| **C2** | Consolidated env reference | ✅ | PR #86 §3. Nine tables (§3.1–§3.9) covering every var read by `config.ts` + Phase 4/7 + compose build args + container runtime. | Every var read by `config.ts` + Phase 4/7 + compose appears exactly once with purpose + default. |
| **C3** | Backup / restore / upgrade runbook | ✅ | PR #86 §11 (Backup / restore: Atlas auto-backup + S3 versioning for managed; mongodump + mc mirror for self-hosted; recommended quarterly drill) + §12 (Upgrade: image tag swap, never `-v`, pre-upgrade backup, rollback). | Dry-run backup→wipe→restore reproduces docs + collab state; image-tag upgrade preserves data. |
| **C4** | Update `GenflowAi.md` deployment note | ✅ #89 | PR #89. §Deployment now lists the live prod stack (`dev-docflow.kedata.cloud` on managed Atlas + external S3 + cloud AI) and links to `DEPLOYMENT.md` + `AI_PROVIDERS.md`. | Note matches shipped stack. |
| **D1** | Licensing decision | ✅ | PR #90. Proprietary decision per PRD §5 (EULA + separate MSA + per-tier Order Form). `LICENSE` references the EULA + MSA + Order Form structure (to be reviewed by HKI counsel). 11/11 package.json have `license: "UNLICENSED"`. README License section + badge updated. | License unambiguous + consistent across README, `LICENSE`, every `package.json`; roadmap §5 marked resolved. |
| **D2** | Third-party license note | ✅ | PR #90. `NOTICE` (NEW, 153 lines) covers MIT (TipTap, Yjs, Hocuspocus, Vue, …) + AGPL §13 callouts (citeproc-js, MinIO) + SSPL §13 note (MongoDB Community). `DEPLOYMENT.md` §2 on-prem compose notes already mention SSPL/AGPL considerations. **License enforcement** (tier caps, signed file, audit log) is deferred to Sprint 11+ — premature until paying customers. | Mongo SSPL + MinIO AGPL + Ollama/model licenses surfaced in deploy docs. |

### What the prod deploy actually proves

- **A1, A2, A4, A5, A6, B1, B2-r1/r2/r3, C1, C2, C3, C4, T1, T2, PR1, PR2 (library)** are shipped (PRs #83, #84, #85, #86, #88, #89, #92, #94). The SPA serves; auth + collab work end-to-end behind nginx; env templates are complete and placeholder-clean; deployment doc captures the actual stack; the AI provider-agnostic compat matrix is asserted at the wire level; the TOC sidebar is live + mounted through the unified `activeSidebar` pattern; the presence gate (library side) is wired so peer-leave is instant.
- **A3 (self-hosted)** is **deferred**, not done — managed Atlas + external S3 cover prod. The compose path is a "pure on-prem" feature; the on-prem acceptance gate still requires it, but it's no longer blocking the current customer profile.
- **B2-c** (local-LLM compose profile) stays in the backlog — pull when a privacy-strict on-prem customer is on the roadmap.
- **B3** (GPU / hardware guide) is partially covered by `DEPLOYMENT.md` §7 (Claude vs DeepSeek vs local Ollama) and `AI_PROVIDERS.md`. Full GPU/VRAM sizing is contingent on B2-c.
- **D1, D2** are release blockers — not deployment blockers.

---

## 3. Phase 9 — Current State Assessment

Verified against `main` @ `54ebab7`.

| Group | # | Task | State | Gap / file pointer | Acceptance gate |
|-------|---|------|-------|--------------------|-----------------|
| **T** | T1 | TOC live updates | ✅ | PR #92. `TOCSidebar.vue` now debounces heading refreshes (60ms) and tracks the active heading on `selectionUpdate` (walks up from caret to nearest heading). 5 unit tests pin: empty state, post-debounce refresh, burst-collapse, active-heading tracking, listener teardown on editor swap. | Adding/editing/removing a heading updates outline within one debounce window. |
| **T** | T2 | Mount TOC via `activeSidebar` | ✅ | PR #92. TOC now mounts on `v-if="activeSidebar === 'toc'"`. The dead `leftSidebarOpen` ref + `@toggle-left-sidebar` listener were removed. The toolbar TOC button already emits `toggle-sidebar: 'toc'` — now correctly routes through the unified `toggleSidebar()`. | Toolbar TOC button opens a live outline without host wiring. |
| **PR** | PR1 | Awareness-driven UI | ✅ | PR #94 (library) + PR #95 (host wiring). Avatar stack in `apps/web/src/components/EditorView.vue` now subscribes to `onAwarenessChange` via the new `awarenessStates` ref, filtered by `present: true` + excludes the local clientId. Peer-leave is instant (one awareness round-trip) — the previous REST 15s lag is gone for presence signals. | Two browsers: live cursors + selections + avatars; peer-leave removes marker instantly (awareness, not TTL). |
| **PR** | PR2 | Scope REST heartbeat | ✅ | PR #94 (library) + PR #95 (host wiring). `EditorView.vue` calls `setLocalCursorEnabled(false)` on route unmount + on `document.visibilitychange` (tab switch / minimize). The awareness `change` event fires synchronously, so peers see the leave within one event tick. The REST `/api/collab/online/:room` 15s poll is kept for the menu UI metadata (better-auth user ids) but no longer drives the avatar stack. | No duplicate/conflicting presence UI in editor. |
| **RO** | RO1 | Role model + migration | ✅ | PR #96. `DocRole = 'viewer' \| 'commenter' \| 'editor'` type + `Document.roles: { userId, role }[]` subdoc + role-aware helpers (`effectiveRole`, `canRead`, `canMutate`, `canComment`). Legacy `collaborators: string[]` retained for back-compat (grants implicit `editor` via `LEGACY_DEFAULT_ROLE`). Idempotent migration runs at boot. | Existing docs load; collaborator assignable to `viewer`/`commenter`/`editor`. |
| **RO** | RO2 | HTTP enforcement | ✅ | PR #96. `routes/documents.ts` uses the role-aware helpers: `canMutate` rejects `viewer`/`commenter` writes with 403, `canRead` accepts all 3 roles. New routes: `GET /:id/access` (returns the caller's role + capabilities), `PUT /:id/roles` (owner-only — set per-user role), `DELETE /:id/roles/:userId` (owner-only — remove collaborator + clear legacy). | Non-collaborator gets 403 on read; viewer/commenter rejected from writes; only owner mutates ACL. |
| **RO** | RO3 | WS role enforcement | ✅ | PR #96. **`utils/roomAccess.ts`** now returns `{ role, isOwner }` (not boolean). `apps/server/src/index.ts` calls `setupReadOnlyWSConnection` for `viewer`/`commenter` — the wrapper intercepts the ws `message` event and drops inbound `MESSAGE_SYNC` (type byte 0). Awareness passes through. Initial sync + state broadcasts still flow so viewers see live edits. Editor / owner get the normal `setupWSConnection`. | Viewer connected to room cannot mutate shared doc; editor can. |
| **C** | C1 | `commentPlugin` (library) | ❌ | `packages/plugins/src/comment.ts` doesn't exist. | Anchored text + comment survives concurrent edits by other users; removed text tombstones thread. |
| **C** | C2 | `CommentThread` model + API | ❌ | `apps/server/src/models/CommentThread.ts` doesn't exist; `routes/comments.ts` doesn't exist. | Threads persist + list per doc + role-gated (commenter+ can create; viewer read-only). |
| **C** | C3 | Wire `CommentsSidebar` | ❌ | `CommentsSidebar.vue` is a UI-only stub, not mounted anywhere. | Two users see each other's comments/replies/resolves in near-real-time; anchors stay correct after edits. |
| **V** | V1 | `DocumentVersion` model | ❌ | Model + `routes/versions.ts` don't exist. | Model compiles + typecheck passes. |
| **V** | V2 | Server-side capture | ❌ | No `versionService.ts`. | `POST /api/documents/:id/versions {label}` creates row from live room state. |
| **V** | V3 | Restore + list + preview | ❌ | `HistorySidebar.vue` emits into the void (`packages/vue/src/types.ts:33-39` snapshots is client-only). | Save→edit→restore → all clients see restored state; list shows author + timestamp. |
| **TP** | TP1 | Templates | ❌ | No template model, no gallery, no "new from template" flow. | Pick template → new doc opens pre-filled; save doc as personal template. |
| **OF** | OF1 | `y-indexeddb` mirror | ❌ | No offline persistence; only `SavingStatus` indicator exists. | Edit offline + reload offline → edits persist; reconnect → merge without loss. |
| **SG** | SG1 | `suggestionPlugin` | ❌ | No track-changes mark. | Suggesting mode renders attributed marks; accept/reject converges; `commenter` role restricted to suggest-only. |

---

## 4. Dependency Graph (verbatim from phase plans §5, condensed)

```
A1 ─► A2 ─┐
A3 ─► A4  ├─► A5 ─► A6
          │        │
Phase1 ─► A4       ├─► C1 ─► C2
Phase3 ─► A2       └─► C3
Phase4 ─► A3, A5
Phase7 ─► B1 ─► B2 ─► B3
B1   ───► A5, C2
A2/A3 ──► C4
D1   ─► D2                       (independent; resolve early — release blocker)

T  ─► (no dep; ship first)
PR ─► (no dep; ship alongside T)
RO ─► RO3 ──────────────────────────┐
            │                        │
Phase1 ─► V ─► V1 ─► V2 ─► V3        │
Phase1 + RO ─► C ─► C1 ─► C2 ─► C3 ─► SG
Phase3 ─► TP
Phase1 ─► OF
```

---

## 5. Recommended Execution Order

### Sprint 9 — Foundation & quick wins

Prod reality (`dev-docflow.kedata.cloud` is live on managed stack) means several "compose-only" tasks (A3, B2) are **not blocking the current customer profile** — they're the "pure on-prem" fork. Sprint 9 prioritises the tasks that ARE blocking (licensing, A1 Dockerfile drift, A4 latent bug, docs lag) and the Phase 9 quick wins.

Status as of 2026-07-26:
- ✅ # — Done in PRs #83, #84, #85, #86
- 🟡 — Verify on next deploy
- ⬜ — Not started

| # | Task | State | Why now | Depends on |
|---|------|-------|---------|------------|
| 1 | **D1** Licensing | ✅ #90 | Release blocker; not code; ship before any other release work. | none |
| 2 | **A1** Consolidate Dockerfile set | ✅ #83 | Every later phase-8 task touches images; do this first to avoid double-touch. | none |
| 3 | **A4** Fix `mongo-init.js` indexes | ✅ #84 | Latent bug for any customer who runs Mongo locally; trivial fix. | Phase 1 (schema known) |
| 4 | **A6 verify** Confirm `/api/health` reaches `db: connected` in prod (Dokploy log + curl from inside cluster) | 🟡 | Ship evidence for the "all-healthy cold start" gate that's already green in reality but undocumented. | none |
| 5 | **C4** Update `GenflowAi.md` deployment note | ✅ #89 | Doc lag — the note still says demo; one paragraph fix. | A2, A6 |
| 6 | **C1** Re-point `DEPLOYMENT.md` to product (managed + on-prem both modes) | ✅ #86 | Doc lag — prod has Atlas+external-S3+cloud-AI; on-prem compose is the fork. | A1, A5 |
| 7 | **T1** Make TOC live | ✅ #92 | Library-only quick win; no deps; ships value immediately. | none |
| 8 | **T2** Mount TOC via `activeSidebar` | ✅ #92 | Establishes the mount pattern other sidebars reuse. | none |
| 9 | **PR1** Awareness-driven presence UI | ✅ #94 (lib) + #95 (host) | Quick win, parallel to TOC; high perceived value in collab. | none |
| — | **A5** env template | ✅ #84 + #85 | (already shipped) | — |
| — | **A3** Self-hosted Mongo + MinIO | 🔵 backlog | **Defer** — prod uses managed; revisit when a "pure on-prem" customer is on the roadmap. | A4 (when resumed) |
| — | **B2** Local-LLM compose profile | 🔵 backlog | **Defer** — prod uses cloud AI; revisit with A3 if a privacy-strict on-prem customer appears. | B1 (when resumed) |

### Sprint 10 — Roles, persistence, docs, AI profile

Status as of 2026-07-26:
- ✅ # — Done in PRs #83, #84, #85, #86
- ⬜ — Not started

| # | Task | State | Why now | Depends on |
|---|------|-------|---------|------------|
| 9 | **RO1** Role model + migration | ✅ #96 | Unblocks safe sharing + gates comments + suggestions. | none |
| 10 | **RO2** HTTP enforcement | ✅ #96 | Closes the live read-authz gap. | RO1 |
| 11 | **RO3** WS role enforcement | ✅ #96 | **Security gate** for comments + suggestions; prototype early to de-risk. | RO1, Phase 1 |
| 12 | **A2** Verify `apps/web` image | ✅ #84 (compose) + 🟢 live | Already mostly done; verify end-to-end in stack. | A1, A3 |
| 13 | **A5** Consolidated env template | ✅ #84 + #85 | After A2/A3; remove `*.kedata.cloud` hardcodes; include all vars. | A2, A3, B1 |
| 14 | **B1** AI env in compose | ✅ live + documented | Server env is done (7F-1); expose to compose. | Phase 7 |
| 15a | **B2-r1** Compat test suite (fixtures) | ✅ #88 | Each provider in the matrix must have a happy-path + error-path fixture. Hardens the library's "truly agnostic" claim. | B1 |
| 15b | **B2-r2** Compat matrix docs | ✅ #88 | `docs/AI_PROVIDERS.md` — supported providers, env config, known quirks. Linked from `DEPLOYMENT.md` §7. | B2-r1 |
| 15c | **B2-r3** Streaming edge-case tests | ✅ #88 | Empty choices, double done, missing `[DONE]`, multi-byte chunk splits, abort mid-stream. | B2-r1 |
| 15d | **B2-c** Local-LLM compose profile | 🔵 backlog | Privacy-strict on-prem customers. Pull into a sprint when needed. | B1 |
| 16 | **V1** `DocumentVersion` model | ⬜ | Phase 1 Yjs persistence is the encode path. | Phase 1 |
| 17 | **V2** Server-side capture | ⬜ | Reuses Phase 1's encode. | V1 |
| 18 | **V3** Restore + list + preview | ⬜ | Wires the existing `HistorySidebar` stub to real data. | V2 |
| 19 | **C1** `commentPlugin` (library) | ⬜ | Anchor via Yjs relative position; library-only. | Phase 1 |
| 20 | **C2** `CommentThread` model + API | ⬜ | Backend for comments. | Phase 1, RO1 |
| 21 | **C3** Wire `CommentsSidebar` | ⬜ | Real-time fan-out. | C1, C2, RO3 |
| 22 | **C4** Update `GenflowAi.md` deployment note | ✅ #89 | After A2/A3 are verified. | A2, A3 |
| 23 | **C1** `DEPLOYMENT.md` rewrite (product, both modes) | ✅ #86 | After A5. | A2, A5 |
| 24 | **C2** Consolidated env reference | ✅ #86 | After A5, B1. | A5, B1 |
| 25 | **C3** Backup/restore/upgrade runbook | ✅ #86 §11–§12 | Verified dry-run before declaring done. | A3, A6 |
| 26 | **B3** GPU / hardware guide | ⬜ | Doc-only; ships with B2. | B2 |
| 27 | **D2** Third-party license note | ✅ #90 | Folded into D1 — third-party surface lives in `NOTICE` + `DEPLOYMENT.md` §2 on-prem notes. | D1 |
| 28 | **PR2** Scope REST heartbeat to out-of-editor | ✅ #94 (lib) + #95 (host) | Doc + small edit; late because presence UI shipped first. | PR1 |
| 29 | **TP1** Templates | ⬜ | Independent; can ship any time. | Phase 3 |
| 30 | **OF1** `y-indexeddb` offline | ⬜ | Last: must coordinate carefully with Phase 1 seeding. | Phase 1 |
| 31 | **SG1** `suggestionPlugin` | ⬜ | Largest; layers on C + RO. | C, RO |

---

## 6. Risks (lifted from phase plans, condensed)

| Risk | Mitigation |
|------|------------|
| **RO3 WS enforcement** (the crux) | Yjs sync is bidirectional and full-fidelity; a "read-only Yjs connection" is not a protocol primitive. Resolve role on connect; for viewer/commenter, **drop their inbound sync (doc-update) messages at the WS layer** while still relaying awareness. Intercept in the vendored `y-websocket/*.cjs`. **Prototype RO3 first; treat it as the phase's security gate.** |
| **Comment anchor survival under concurrent edits** | Hybrid model: anchor via `commentMark { threadId }` tracked by a Yjs relative position (Yjs's strength); thread bodies/replies in Mongo keyed by `threadId`. Mark holds **id only, never text** (same invariant as Phase 6 citations). E2E must assert anchors stay correct under simultaneous edits. |
| **Mongo + MinIO backup inconsistency** | Backup/restore **must** coordinate `mongodump` + `mc mirror`; objects referenced by docs must exist in MinIO. **Verified dry-run is the C3 acceptance gate.** *Prod uses managed Atlas + external S3 — Atlas auto-backup + S3 versioning cover the data side; C3 still needs to document the operator procedure (Atlas PITR, S3 bucket versioning) + the on-prem compose case.* |
| **Cross-domain OAuth / cookies fail** | Mandatory better-auth `storeStateStrategy: database` + `skipStateCookieCheck: true`, `CLIENT_ORIGIN`/trustedOrigins, backend-domain redirect URI, HTTPS + `sameSite`/`secure`. Document explicitly in C1. |
| **GPU unavailable / driver mismatch** | Local LLM is opt-in (`--profile local-llm`); Claude is the default + GPU-free; document NVIDIA Container Toolkit prereq + CPU-only fallback (B3). |
| **A1 Dockerfile consolidation drift** | Do this before any A2/A3 work to avoid touching two locations. |
| **Stale `mongo-init.js` blocks fresh email/password users** | Fix in A4 (sparse+unique `googleId`, add `collabstates` index). |
| **Data loss on upgrade** | Named volumes `mongo-data`/`minio-data`; upgrade runbook swaps image tags only, never removes volumes; document `down` (not `down -v`) + pre-upgrade backup. *For managed prod (Atlas + external S3) this is a deploy-platform concern, not an app concern; document the platform rollback path in C3 anyway.* |
| **Roles migration breaks existing docs** | `collaborators: string[]` → `{userId, role}[]` is a breaking schema change; migrate existing entries to `role: 'editor'` with a one-release read-compat shim. |
| **Real-time comment fan-out** | Comments in Mongo don't auto-sync like Yjs. Broadcast thread changes over the existing collab WS (or a lightweight topic) — **do not poll.** |
| **AI provider misconfig leaks content** | Document local preset clearly; verify no egress with local provider (B2 acceptance); make `AI_PROVIDER` explicit in env template. |
| **Secrets in plaintext** | `.env.docker` already in `.dockerignore`; document `openssl rand` generation + file perms + Docker secrets / external secret-store for production. Web build args (`VITE_*`) are public — only non-secrets there. |
| **Local-LLM resource starvation** | Profile-gated + documented resource reservations/limits; single-host assumption noted. |
| **Offline vs Phase 1 seeding double-apply** | Gate offline mirror to reconcile **only after the server `synced` event**; never seed from an offline-only cache. |
| **TOC sidebar orphan wiring** | T2 establishes the `activeSidebar` mount pattern reused by Comments/History. |
| **Two Dockerfile sets drift** | A1 closes this. |

---

## 7. Out of Scope (verbatim from both phase plans)

- Multi-instance horizontal scaling (shared Yjs pub/sub, load-balanced server, replica-set/sharded Mongo, distributed MinIO). On-prem is single-host, single-instance.
- Enterprise SSO (SAML / OIDC / LDAP) — external OAuth + email/password only.
- Kubernetes / Helm / cloud-managed orchestration — Docker Compose only.
- Automated TLS termination inside the stack — edge TLS is the customer's reverse proxy + Let's Encrypt.
- Air-gapped installs — on-prem is "self-hosted with internet."
- RAG vector-store provisioning beyond exposing its env — datastore choice is a roadmap open question.
- AI features / `AISidebar` (owned by Phase 7) / Citations (Phase 6) / Export of comments or suggestions (depends on Phase 5).
- Org-wide / SCIM group-based roles — roles here are per-document only.
- Horizontal multi-instance collaboration scaling.
- Real-time co-editing of comment bodies — only thread lists sync live; bodies are single-author.
- Visual redline between two arbitrary versions — restore/preview only for now.

---

## 8. Verification (gate per `AGENTS.md`)

After every shipped sub-group:

```bash
pnpm --filter <package>      typecheck
pnpm --filter <package>      test:unit
pnpm lint
pnpm test:e2e                # UI/layout-affecting sub-groups only
pnpm --filter <packages>     build
```

Per the 7F-3 acceptance template, Phase 8 adds:

- **A3** E2E: `docker compose up` → `curl http://localhost:8080` returns the SPA; sign up + create doc + open in 2 browsers (cold-start verification).
- **A4** unit: fresh mongo container creates email/password user + collab doc without duplicate-key error.
- **A6** E2E: cold start reaches all-healthy in <90s; `curl /api/health` returns `{status:'ok', db:'connected'}`.
- **B2** E2E: with `--profile local-llm`, an AI action completes; privacy probe (7F-3d) verifies no egress.
- **C3** dry-run: backup → wipe → restore reproduces all docs + collab state + minio objects.

Per Phase 9 §4 Group G:

- **T1** unit: TOC updates within one debounce window after a heading mutation.
- **PR1** E2E: two browsers see each other's live cursor + selection; peer-leave removes marker.
- **RO3** E2E: **the key security gate** — viewer connected to room cannot mutate shared doc (use the Phase 1 two-client pattern from `e2e/product/collaboration.spec.ts`).
- **C** E2E: anchor survival under concurrent edits — the #1 correctness risk per §6.
- **V** E2E: save → edit → restore → all clients see restored state (extends Phase 1's restart-durability test).
- **OF** E2E: edit offline + reload offline → edits persist; reconnect → merge without loss.
- **SG** E2E: accept/reject converges across clients.

---

## 9. Suggested Work Streams

Prod is live on managed stack. Stream D downscopes to docs + latent-bug fix + licensing; A3/B2 move to a "pure on-prem" backlog (run when a customer needs them, not now).

Status as of 2026-07-28: A1, A4, A5, A6, B1, B2-r1/r2/r3, C1, C2, C3, C4, D1, D2, T1, T2, PR1, PR2, RO1, RO2, RO3 shipped. Phase 9 remaining: V (versioning), C (comments), TP, OF, SG. A6 verify + license enforcement deferred to Sprint 11+.

### Stream D — Deploy hygiene + docs (0.5 dev, Sprint 9)
~~D1 → A1 → A4 → C4 → D2~~ → A6 verify (on next deploy)

### Stream T — TOC + Presence (0.5 dev, Sprint 9)
~~T1 → T2 → PR1 (lib+host) → PR2 (lib+host)~~

### Stream C — Collab (1 dev, Sprint 10)
~~RO1 → RO2 → RO3~~ → V1 → V2 → V3 → C1 → C2 → C3 → TP1 → OF1 → SG1

### Stream C — Collab (1 dev, Sprint 10)
RO1 → RO2 → RO3 (prototype early, security gate) → V1 → V2 → V3 → C1 → C2 → C3 → TP1 → OF1 → SG1

### Backlog (pure on-prem fork — not on Sprint 9-10 critical path)
A3 (self-hosted Mongo + MinIO), B2-c (local-LLM profile), B3 (GPU guide). Pull into a sprint when a customer asks for air-gapped-style self-host.

---

## 10. Related Documents

- [`github-issues-execution-order.md`](github-issues-execution-order.md) — sprint-by-sprint backlog
- [`phase-8-deployment-packaging.md`](phase-8-deployment-packaging.md) — A/B/C/D task spec
- [`phase-9-google-docs-parity.md`](phase-9-google-docs-parity.md) — T/PR/RO/C/V/TP/OF/SG task spec
- [`ENHANCEMENT_ROADMAP.md`](../ENHANCEMENT_ROADMAP.md) §5 — open questions including licensing
- [`DEPLOYMENT.md`](../DEPLOYMENT.md) — current deployment doc (rewritten by C1 in PR #86, both modes + consolidated env reference)
- [`GenflowAi.md`](../../CLAUDE.md) §Deployment — deployment note (updated by C4 in PR #89 — lists live prod stack + links to `DEPLOYMENT.md` + `AI_PROVIDERS.md`)
- [`AI_PROVIDERS.md`](../AI_PROVIDERS.md) — supported OpenAI-compatible providers matrix (shipped in B2-r2 PR #88)
- [`LICENSE`](../LICENSE) — proprietary EULA reference (shipped in D1 PR #90)
- [`NOTICE`](../NOTICE) — third-party license notices (shipped in D1 / D2 PR #90)