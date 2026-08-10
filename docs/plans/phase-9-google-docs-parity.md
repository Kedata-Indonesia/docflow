# Phase 9 — Google-Docs Feature Parity · Task-Level Implementation Plan

**Roadmap ref:** [ENHANCEMENT_ROADMAP.md](../ENHANCEMENT_ROADMAP.md) Phase 9 · **Priority:** P2 (candidate scope) · **Last updated:** 2026-07-26

> **Sprint execution plan:** see [`sprint-9-10-execution-plan.md`](sprint-9-10-execution-plan.md) for current-vs-target state per task and the recommended order (this doc is the task spec; the sprint plan is the work-breakdown).

> **Goal:** close the gap to a Docs-class experience — version history, comments &
> suggestions, live TOC, presence polish, templates, offline editing, and permission roles.
> **This scope is not committed.** Each feature is scoped as an independent sub-group with its
> own priority so the phase can be scheduled à la carte. Two features (versioning, comments)
> depend on **Phase 1's server-authoritative Yjs persistence** and must not ship before it.

> **Grounding note:** every "today" claim below is verified against the current tree at the
> cited `file:line`. The headline finding: **the feature sidebars are UI-only presentational
> stubs, exported from the package but never rendered by `<DocsEditor>` and wired to no data
> source.** Phase 9 is mostly about building the *data + wiring* behind these shells.

---

## 1. Current State (what exists vs. what's a stub)

### The sidebars are orphan presentational components

All four sidebars are exported from the Vue package ([index.ts:12-15](../../packages/vue/src/index.ts))
but **none are rendered inside `<DocsEditor>`** — `grep` for `HistorySidebar|CommentsSidebar|TOCSidebar|AISidebar`
in [DocsEditor.vue](../../packages/vue/src/components/DocsEditor.vue) returns nothing. `DocsEditor`
only tracks an `activeSidebar` key ([DocsEditor.vue:131,431](../../packages/vue/src/components/DocsEditor.vue))
and forwards a `toggle-sidebar` event from the toolbar; **no component mounts off that state.**
A host app must import and wire each sidebar itself, supplying all data via props/emits.

| Sidebar | Status | Props / emits (the contract a host must fill) | File |
|---------|--------|-----------------------------------------------|------|
| **HistorySidebar** | **UI-only stub — no data source, not rendered** | props `snapshots`, `activePreviewIndex`; emits `save-snapshot`, `restore-snapshot`, `preview-snapshot` | [HistorySidebar.vue:14-23](../../packages/vue/src/components/sidebars/HistorySidebar.vue) |
| **CommentsSidebar** | **UI-only stub — client-side types only, not rendered** | props `comments`, `selectedTextSnippet`, `selectedTextIndex`; emits `add-comment`, `add-reply`, `resolve-comment` | [CommentsSidebar.vue:12-22](../../packages/vue/src/components/sidebars/CommentsSidebar.vue) |
| **TOCSidebar** | **Partially functional — reads the live doc, but not *live-updating*** | prop `editor`; emits `close` | [TOCSidebar.vue:33-80](../../packages/vue/src/components/sidebars/TOCSidebar.vue) |
| **AISidebar** | UI stub (owned by Phase 7, out of scope here) | — | — |

### Feature-by-feature reality

- **Version history — shipped (V1+V2+V3).** `DocumentVersion` model (Yjs update blob per §3) +
  `services/versionService.ts` + `routes/versions.ts` capture from the live room;
  `HistorySidebar` is mounted and wired end-to-end; restore is client-driven via
  `GET /versions/:versionId/content` + `setContent` (rides the Yjs sync path).
- **Comments — 0% backend, fragile anchor model.** `CommentItem` is client-only
  ([types.ts:18-31](../../packages/vue/src/types.ts)) and anchors to text via
  `anchorText: string` / `anchorIndex: number` — **plain strings, not ProseMirror positions or
  marks**, so an anchor cannot survive an edit. No comment mark/decoration exists in the editor;
  no server model; no sync channel.
- **TOC — functional but stale.** `refreshHeadings` walks `editor.state.doc.descendants`
  ([TOCSidebar.vue:33-52](../../packages/vue/src/components/sidebars/TOCSidebar.vue)) and jump
  works ([:63-80](../../packages/vue/src/components/sidebars/TOCSidebar.vue)). **But it only
  refreshes `onMounted` + `watch(() => props.editor)` ([:54-55](../../packages/vue/src/components/sidebars/TOCSidebar.vue))
  — never on document transactions**, so the outline goes stale as you type. Also: the sidebar
  is never mounted by `DocsEditor` (above), and active-heading tracking on scroll is absent.
- **Presence — real but split across two mechanisms.** (1) **Yjs awareness** carries live
  cursors when a provider is connected: `AwarenessState { user, cursor }`
  ([Collaboration.ts:9-13](../../packages/core/src/Collaboration.ts)),
  `createAwarenessStates` + `onAwarenessChange` ([:37-83](../../packages/core/src/Collaboration.ts)).
  (2) A **REST heartbeat** path duplicates a coarse presence list: `Presence` model + 60s TTL,
  `POST /api/collab/heartbeat`, `GET /api/collab/online/:roomId`
  ([collab.ts:15-84](../../apps/server/src/routes/collab.ts)). No consolidated avatar stack,
  follow-cursor, or selection highlighting in the UI.
- **Templates — shipped (TP1).** `DocumentTemplate` model + `routes/templates.ts` + boot-seeded
  system templates; dashboard gallery is API-driven; "new from template" clones via the existing
  `POST /api/documents` + seed-on-open; doc-card menu has "Save as template".
- **Offline — shipped (OF1).** `packages/core/Collaboration.ts` attaches `IndexeddbPersistence`
  (`docflow-<room>`) via an opt-in `offline` option; the host enables it in both provider
  branches; `connection-state` is driven by the real provider status. Offline edits persist
  across reload and merge on reconnect (verified: no loss, no duplication).

### The permission model is flat, and the WS grant is binary

- `Document.collaborators` is a **flat `string[]`** of user IDs — **no roles**
  ([Document.ts:9-14,25](../../apps/server/src/models/Document.ts)).
- HTTP enforcement is inconsistent: `GET /api/documents/:id` has **no access check at all** (any
  authenticated user can read any doc, [documents.ts:33-42](../../apps/server/src/routes/documents.ts));
  `PUT` requires `owner` ([:79-82](../../apps/server/src/routes/documents.ts)); managing
  collaborators is owner-only ([:107-166](../../apps/server/src/routes/documents.ts)).
- The **collab WebSocket grant is all-or-nothing**: `canAccessRoom` returns true for
  `owner` **or** any `collaborators` member ([index.ts:80-93](../../apps/server/src/index.ts)),
  and a connected Yjs client can always push updates. **There is no "read-only" or "comment-only"
  WS connection today** — this is the crux of the roles work (see §6).

### What Phase 1 gives us to build on

Version history and comments both need a durable, server-authoritative Yjs state. Phase 1
delivers exactly that: a Mongo-backed persistence adapter that encodes `Y.encodeStateAsUpdate`
into a `CollabState` collection and derives `Document.content`. **Phase 9 versioning reuses that
encode path; Phase 9 comments ride the same authoritative ydoc.** Do not start V/C sub-groups
until Phase 1 has landed.

---

## 2. Target Architecture

Where each feature's **state of record** lives — and the one rule that decides it: anything that
must **survive concurrent edits** anchors in Yjs (relative positions); anything that must be
**queried/notified across documents** lives in Mongo. Some features need both.

```
┌───────────────────────── LIBRARY (packages/*) — no backend concerns ─────────────────────────┐
│                                                                                               │
│  ProseMirror / Y.Doc  ── single source of truth ─────────────────────────────────────────┐   │
│    • TOC:        derived read-only view of headings (transaction-driven)   [pure library] │   │
│    • Comments:   commentMark { threadId } anchored via Yjs relative position [library]     │   │
│    • Suggestions:track-changes marks (insertion/deletion) in the doc         [library]     │   │
│    • Presence:   Yjs awareness (cursors/selections)                          [library]     │   │
│    • Offline:    y-indexeddb provider mirrors the Y.Doc locally              [library]     │   │
│  commentPlugin / suggestionPlugin / aiPlugin authored as DocsEditorPlugin ────────────────┘   │
│                                      │ narrow injected ports (onCommentThread, onVersionSave)  │
└──────────────────────────────────────┼────────────────────────────────────────────────────────┘
                                        │
┌──────────────────────── APP (apps/web + apps/server) — owns persistence/query ───────────────┐
│                                        ▼                                                       │
│   WS server (Phase-1 authority)   Mongo collections                                           │
│   • enforces role on connect  ──► CollabState   (authoritative Yjs binary)  [Phase 1]         │
│     (viewer = no write msgs)      DocumentVersion{ docId,label,state:Buffer }  ◄─ Versioning   │
│                                   CommentThread{ docId,threadId,body,replies } ◄─ Comments     │
│                                   Document.collaborators[] → {userId,role}     ◄─ Roles        │
│                                   DocumentTemplate{ name,content,category }    ◄─ Templates     │
│                                   Presence (REST heartbeat, existing)          ◄─ Presence      │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Placement decisions (the answer to the roadmap's open question):**

| Feature | State of record | Rationale |
|---------|-----------------|-----------|
| **TOC** | Derived from Y.Doc, nothing persisted | Pure view; recompute on transaction. |
| **Versioning** | **Mongo `DocumentVersion` (encoded Yjs state per version)** | Needs cross-doc listing + metadata; captured server-side reusing Phase 1's encode path; keeps the live doc lean (gc stays on). |
| **Comments** | **Hybrid: anchor in Yjs (`commentMark`), thread body in Mongo `CommentThread`** | Anchors *must* survive concurrent edits → Yjs relative positions; bodies/replies/resolve-state must be queryable + drive notifications → Mongo, keyed by a stable `threadId` the mark carries. Mark stores **id only, never text** (same invariant as Phase 6 citations). |
| **Suggestions** | Yjs (track-changes marks in the doc) | Must merge concurrently and render inline; accept/reject = a transaction. |
| **Presence** | Yjs awareness (live) + existing REST heartbeat (coarse) | Consolidate UI on awareness; keep heartbeat only for out-of-editor "who's here" lists. |
| **Templates** | Mongo `DocumentTemplate` | App-side content library; "new from template" clones content into a new doc. |
| **Offline** | Y.Doc mirrored to `y-indexeddb` | Library-side; reconciles with server state on reconnect. |
| **Roles** | Mongo `Document.collaborators[] → {userId, role}` + WS enforcement | Enforcement point is the WS server, not the library (see §6). |

---

## 3. Data Model

### Versioning — `apps/server/src/models/DocumentVersion.ts` (new)

```ts
interface IDocumentVersion {
  docId: string          // Document _id
  label: string          // named version, e.g. "Approved Final Draft"; '' for auto-versions
  auto: boolean          // true = periodic auto-snapshot, false = user-named
  state: Buffer          // Y.encodeStateAsUpdate(ydoc) at capture time
  contentPreview: string // first N chars of derived plainText, for the list UI
  createdBy: string      // user id
  createdAt: Date
}
// index { docId: 1, createdAt: -1 }
```
Restore = decode `state` → apply into the live room (as a new update, not a raw replace) so
connected clients converge. `DocumentSnapshot` ([types.ts:33-39](../../packages/vue/src/types.ts))
is upgraded from `content: string` to reference `{ versionId, label, createdBy, createdAt }`.

### Comments — `apps/server/src/models/CommentThread.ts` (new)

```ts
interface ICommentReply { id: string; authorId: string; body: string; createdAt: Date }
interface ICommentThread {
  docId: string
  threadId: string       // stable id; also stored in the doc's commentMark
  authorId: string
  body: string
  quotedText: string     // snapshot of anchored text at creation (display only, not the anchor)
  resolved: boolean
  resolvedBy?: string
  resolvedAt?: Date
  replies: ICommentReply[]
  createdAt: Date
}
// index { docId: 1, resolved: 1, createdAt: -1 }
```
The **anchor** is not stored here — it lives in the doc as a `commentMark` whose only attr is
`threadId`, positioned via a Yjs relative position so it tracks edits. `CommentItem`
([types.ts:18-31](../../packages/vue/src/types.ts)) drops `anchorIndex: number` in favour of
`threadId`.

### Roles — extend `Document.collaborators` ([Document.ts:9-14](../../apps/server/src/models/Document.ts))

```ts
type Role = 'viewer' | 'commenter' | 'editor'
// migrate: collaborators: string[]  →  collaborators: { userId: string; role: Role }[]
interface IDocument {
  owner: string                                  // implicit 'owner' role (full control)
  collaborators: { userId: string; role: Role }[]
  // ...unchanged
}
```
Backward-compat migration: existing `string[]` entries become `{ userId, role: 'editor' }`.

### Templates — `apps/server/src/models/DocumentTemplate.ts` (new)

```ts
interface IDocumentTemplate {
  name: string
  category: string        // "Letter", "Report", "Meeting Notes", …
  content: object         // TipTap JSON
  thumbnail?: string
  scope: 'system' | 'user'
  owner?: string          // set when scope === 'user'
  createdAt: Date
}
```

---

## 4. Task Breakdown

Each candidate feature is an independent sub-group with **files · work · acceptance ·
dependencies (⇐) · in-phase priority**. Priority is a *recommendation* for scheduling an
uncommitted scope, not a commitment.

> **Recommended in-phase ordering (rationale in §5):**
> **P9-1 TOC** (cheap, library-only, ~80% done) →
> **P9-2 Presence polish** (awareness already emits) →
> **P9-3 Roles** (unblocks safe sharing + gates comments/suggestions) →
> **P9-4 Comments** (high value; ⇐ Phase 1 + Roles) →
> **P9-5 Versioning** (⇐ Phase 1) →
> **P9-6 Templates** (app-only, independent) →
> **P9-7 Offline** (library; interacts with Phase 1 seeding) →
> **P9-8 Suggestions** (largest; builds on Comments + Roles).

### Group T — Live TOC · **priority P9-1 (quick win)** ⇐ none

**T1. Make the outline live.**
- File: [TOCSidebar.vue](../../packages/vue/src/components/sidebars/TOCSidebar.vue)
- Replace the mount-only `refreshHeadings` ([:54-55](../../packages/vue/src/components/sidebars/TOCSidebar.vue))
  with a subscription to `editor.on('update' | 'transaction')` (debounced), cleaned up on unmount.
- Add active-heading tracking driven by scroll position (IntersectionObserver over rendered
  headings), replacing the fragile `textContent` match in the jump handler ([:69-78](../../packages/vue/src/components/sidebars/TOCSidebar.vue)).
- Accept: adding/editing/removing a heading updates the outline within one debounce window; the
  current section highlights as you scroll.

**T2. Mount the sidebar in `<DocsEditor>` (or document the wiring).**
- File: [DocsEditor.vue](../../packages/vue/src/components/DocsEditor.vue)
- Render `TOCSidebar` off `activeSidebar === 'toc'` ([:131,431](../../packages/vue/src/components/DocsEditor.vue)),
  passing `:editor`. Establish the pattern the other sidebars reuse.
- Accept: toggling the TOC toolbar button opens a working outline with no host wiring.

### Group PR — Presence polish · **priority P9-2 (quick win)** ⇐ none

**PR1. Consolidate on awareness for in-editor presence.**
- Files: [Collaboration.ts](../../packages/core/src/Collaboration.ts), [DocsEditor.vue](../../packages/vue/src/components/DocsEditor.vue)
- Drive a live collaborator avatar stack + remote selection highlights from
  `onAwarenessChange` ([:76-83](../../packages/core/src/Collaboration.ts)); the `cursor` field is
  already present in `AwarenessState` ([:9-13](../../packages/core/src/Collaboration.ts)).
- Add optional "follow user" (scroll to a peer's cursor).
- Accept: two browsers show each other's live cursors, selections, and avatars; a peer leaving
  removes their marker immediately (awareness change, not TTL).

**PR2. Scope the REST heartbeat to out-of-editor use only.**
- File: [collab.ts:37-84](../../apps/server/src/routes/collab.ts)
- Keep `heartbeat`/`online` for dashboard "who's viewing" lists; document that in-editor presence
  is awareness-driven to avoid the two paths disagreeing.
- Accept: no duplicate/conflicting presence UI inside the editor.

### Group RO — Permission roles · **priority P9-3 (unblocks C & SG)** ⇐ none (but pairs with Phase 1 for WS)

**RO1. Model + migration.**
- Files: [Document.ts](../../apps/server/src/models/Document.ts), migration script.
- Change `collaborators: string[]` → `{ userId, role }[]` (§3); migrate existing entries to
  `role: 'editor'`.
- Accept: existing docs load; a collaborator can be assigned viewer/commenter/editor.

**RO2. HTTP enforcement (fix the current gaps).**
- File: [documents.ts](../../apps/server/src/routes/documents.ts)
- Add a role resolver; **close the open `GET /:id`** ([:33-42](../../apps/server/src/routes/documents.ts))
  so only owner/collaborators read; gate collaborator management (already owner-only) on role.
- Accept: a non-collaborator gets 403 on read; only owner mutates the ACL.

**RO3. WS role enforcement (the hard part — see §6).**
- File: [index.ts:80-93,135-147](../../apps/server/src/index.ts); WS message handling in the
  vendored `y-websocket/*.cjs`.
- `canAccessRoom` must return the caller's **role**, not a boolean. For `viewer`/`commenter`,
  the connection must **not** apply their doc updates: either (a) intercept and drop non-awareness
  sync messages from restricted connections at the WS layer, or (b) serve viewers a read-only
  HTTP snapshot + awareness-only socket. Recommend (a); prototype early to de-risk.
- Accept: a viewer connected to the room cannot mutate the shared doc (their edits never
  propagate); an editor can.

### Group C — Comments & suggestions: Comments · **priority P9-4** ⇐ Phase 1, RO (commenter role)

**C1. `commentPlugin` — comment mark anchored in Yjs (library).**
- Files: `packages/plugins/src/comment.ts` (new), authored as a `DocsEditorPlugin`
  ([PluginSystem.ts:18-28](../../packages/core/src/PluginSystem.ts)); export via `defaultPlugins`.
- A `commentMark` with a single `threadId` attr (**id only, never text**), placed/tracked via a
  Yjs relative position so it survives concurrent edits; a bubble-menu "Add comment" action; a
  decoration to highlight anchored ranges and emit selection → sidebar.
- Accept: highlighting text and commenting creates a stable anchor that follows subsequent edits
  by other users; removing the text tombstones the thread.

**C2. `CommentThread` model + API (app).**
- Files: `apps/server/src/models/CommentThread.ts` (new), `apps/server/src/routes/comments.ts` (new).
- CRUD for threads/replies/resolve, scoped by doc + role (commenter+ may create; viewer read-only).
- Accept: threads persist, list per doc, and enforce role.

**C3. Wire `CommentsSidebar` to real data (app + vue).**
- Files: [CommentsSidebar.vue](../../packages/vue/src/components/sidebars/CommentsSidebar.vue),
  `apps/web` editor view, [DocsEditor.vue](../../packages/vue/src/components/DocsEditor.vue).
- Fulfil the existing prop/emit contract ([:12-22](../../packages/vue/src/components/sidebars/CommentsSidebar.vue))
  from the API; replace `anchorIndex` with `threadId`; mount off `activeSidebar === 'comments'`;
  broadcast thread changes (reuse WS or a lightweight channel) for real-time updates.
- Accept: two users see each other's comments/replies/resolves in near-real-time; anchors stay
  correct after edits; resolved threads move to the "Resolved" filter.

### Group SG — Comments & suggestions: Suggestions (track changes) · **priority P9-8 (largest)** ⇐ C, RO

**SG1. `suggestionPlugin` — track-changes marks (library).**
- Files: `packages/plugins/src/suggestion.ts` (new).
- "Suggesting mode" renders insertions/deletions as marks (author-attributed) rather than direct
  edits; accept/reject apply as ProseMirror transactions (so they flow through Yjs like any edit).
- Accept: in suggesting mode, edits appear as reviewable marks; accept/reject converge across
  clients; `commenter` role is restricted to suggesting (no direct edits).

### Group V — Version history · **priority P9-5** ⇐ Phase 1

**V1. `DocumentVersion` model.** ⇐ Phase 1
- File: `apps/server/src/models/DocumentVersion.ts` (new) — schema per §3.
- Accept: model compiles; typecheck passes.

**V2. Server-side capture (reuse the Phase 1 encode path).** ⇐ V1
- Files: Phase 1's `mongoPersistence.ts` / a new `versionService.ts`, `apps/server/src/routes/versions.ts` (new).
- Named version: on demand, `Y.encodeStateAsUpdate(ydoc)` → `DocumentVersion` with label + preview.
  Auto-version: optional periodic capture (config `VERSION_AUTO_INTERVAL_MS`).
- Accept: `POST /api/documents/:id/versions { label }` creates a row from the live room state.

**V3. Restore + list + preview.** ⇐ V2
- Files: `versions.ts`, [HistorySidebar.vue](../../packages/vue/src/components/sidebars/HistorySidebar.vue), `apps/web`.
- Restore applies the decoded version into the live room as an update (converges connected
  clients); preview renders read-only. Fulfil the existing sidebar contract
  ([:14-23](../../packages/vue/src/components/sidebars/HistorySidebar.vue)); upgrade
  `DocumentSnapshot` ([types.ts:33-39](../../packages/vue/src/types.ts)) to reference `versionId`.
- Accept: save a named version, edit, restore it → all clients see the restored state; no content
  loss; the list shows author + timestamp.

### Group TP — Templates · **priority P9-6 (independent)** ⇐ Phase 3 (`apps/web`)

**TP1. `DocumentTemplate` model + API + gallery.**
- Files: `apps/server/src/models/DocumentTemplate.ts` (new), `apps/server/src/routes/templates.ts` (new), `apps/web` gallery + "new from template".
- "New from template" clones `content` into a fresh `Document` owned by the caller.
- Accept: pick a template → a new doc opens pre-filled; users can save a doc as a personal template.

### Group OF — Offline editing · **priority P9-7** ⇐ Phase 1 (interacts with seeding)

**OF1. `y-indexeddb` mirror (library).**
- Files: [Collaboration.ts](../../packages/core/src/Collaboration.ts), `apps/web` editor view; add `y-indexeddb` (optional peer dep).
- Attach an `IndexeddbPersistence` to the room `Y.Doc` so edits persist locally and reconcile on
  reconnect; drive the `SavingStatus='offline'` indicator ([StatusBar.vue:80](../../packages/vue/src/components/StatusBar.vue)) from provider connectivity.
- **Coordinate with Phase 1's client-assisted seed** so a locally-cached doc doesn't re-seed or
  fight the server's authoritative load.
- Accept: edit offline, reload the tab offline → edits persist; reconnect → local and server
  states merge with no loss or duplication.

### Group G — Tests & verification (per shipped sub-group)

- **Unit:** comment-anchor survival under concurrent edits (relative position mapping); version
  encode/restore round-trip; role resolver; template clone.
- **E2E:** two-client comments/resolves; version save→edit→restore durability (extends Phase 1's
  restart test); viewer cannot write over WS (RO3 — the key security gate); offline edit + reconnect
  merge; live TOC updates on typing.
- Gate per [AGENTS.md](../../AGENTS.md): lint → typecheck → unit → e2e (UI/layout) → build.

---

## 5. Sequencing

```
Phase 1 (authoritative Yjs persistence) ─────────────┐  (hard dependency for C, SG, V, OF)
Phase 3 (apps/web) ─────────────────────┐            │
                                         │            │
 T (Live TOC) ───────────────────────────┘  [no dep; ship first, quick win]
 PR (Presence) ──────────────────────────┘  [no dep; quick win]
 RO (Roles) ─► RO3 (WS enforcement) ─────────────────────────────┐
                          │                                       │
 Phase 1 ─► V (Versioning) ─► V1 ─► V2 ─► V3                      │
 Phase 1 + RO ─► C (Comments) ─► C1 ─► C2 ─► C3 ─► SG (Suggestions)
 Phase 3 ─► TP (Templates)
 Phase 1 ─► OF (Offline)
```

**Rationale for the order:** **TOC** and **Presence** are library-only quick wins with no
dependency and immediate perceived value — ship them first while Phase 1 settles. **Roles** is
next because comments' `commenter` role and suggestions both need it, and it also closes a live
read-authz gap (RO2). **Comments** is the highest-value structural feature but gates on Phase 1
(authoritative doc) + Roles. **Versioning** also gates on Phase 1 and reuses its encode path.
**Templates** is independent (only needs `apps/web`). **Offline** and **Suggestions** are last:
offline must be reconciled carefully against Phase 1 seeding, and suggestions is the largest build
and layers on Comments + Roles. **Do not begin V or C before Phase 1 is merged and its
restart-durability test passes.**

## 6. Risks & Mitigations

| Risk | Analysis / Mitigation |
|------|-----------------------|
| **Comments: Yjs-native vs. separate collection** | *Yjs-native* (comment data in the Y.Doc): anchors survive edits and sync free, offline-capable — but data is buried in binary (no cross-doc queries, notifications, or moderation), bloats the doc, and can't be role-gated (Yjs sync is all-or-nothing). *Separate Mongo collection with position anchors*: queryable + notifiable, but **plain positions drift under concurrent editing** — the hard, error-prone part. **Chosen: hybrid** — anchor via a `commentMark { threadId }` tracked by a Yjs relative position (Yjs's core strength) while thread bodies/replies/resolve-state live in Mongo keyed by `threadId`. Mark holds **id only, never text** (same invariant as Phase 6 citations, [ENHANCEMENT_ROADMAP.md](../ENHANCEMENT_ROADMAP.md) §Phase 6). *Validate anchor survival under concurrent edits — the #1 correctness risk here.* |
| **Versioning: Yjs snapshots vs. separate collection** | *Yjs-native snapshots* (`Y.snapshot`) require **keeping the full update history (gc off)** → the live doc grows unbounded, and listing versions with metadata from Mongo is awkward. *Separate collection of encoded states* costs storage per version but keeps the live doc lean (gc stays on), is trivially queryable, and **reuses Phase 1's existing `Y.encodeStateAsUpdate` path**. **Chosen: `DocumentVersion` collection storing encoded Yjs state**, captured server-side; restore applies the decoded state as an update so connected clients converge (never a raw replace mid-session). |
| **Permission enforcement on the collab WS (the crux)** | A connected Yjs client can always emit updates; Yjs sync is bidirectional and full-fidelity, so a "read-only Yjs connection" is not a protocol primitive. `canAccessRoom` today is binary owner/collaborator ([index.ts:80-93](../../apps/server/src/index.ts)). **Mitigation:** resolve **role** on connect (RO3) and, for viewer/commenter, **drop their inbound sync (doc-update) messages at the WS layer** while still relaying awareness — requires intercepting messages in the vendored `y-websocket/*.cjs`. Commenter = suggest/comment only (no direct doc mutation), enforced the same way at the message boundary. Prototype RO3 first; treat it as the phase's security gate. |
| **TOC never live / sidebar never mounted** | The sidebars are orphan exports (§1). Establish the `activeSidebar`-driven mount pattern in T2 and reuse it for Comments/History; add a transaction subscription in T1. |
| **Offline vs. Phase 1 seeding double-apply** | A locally cached `y-indexeddb` doc could collide with Phase 1's client-assisted seed → duplicated content. Gate the offline mirror to only reconcile after the server `synced` event and never seed from an offline-only cache. |
| **Roles migration breaks existing docs** | `collaborators: string[]` → `{userId, role}[]` is a breaking schema change; migrate existing entries to `role: 'editor'` and keep a read-compat shim for one release. |
| **Real-time comment fan-out** | Comments in Mongo don't auto-sync like Yjs. Broadcast thread changes over the existing collab WS (or a lightweight topic) rather than polling, to keep the sidebar live. |

## 7. Out of Scope (this phase)

- **AI features / `AISidebar`** — owned by Phase 7 (provider abstraction, inline transforms, chat).
- **Citations / references** — owned by Phase 6.
- **Export (PDF/DOCX) of comments or suggestions** — depends on Phase 5; revisit when both land.
- **Enterprise SSO / SCIM group-based roles** — roles here are per-document (viewer/commenter/editor), not org-wide (see [ENHANCEMENT_ROADMAP.md](../ENHANCEMENT_ROADMAP.md) §5).
- **Horizontal multi-instance collaboration scaling** — single-server assumption inherited from Phase 1.
- **Real-time co-editing of comments' bodies** — comment bodies are edited by a single author; only thread lists sync live.
- **Version diff visualization (visual redline between two arbitrary versions)** — restore/preview only for now; diff UI is a follow-on.
