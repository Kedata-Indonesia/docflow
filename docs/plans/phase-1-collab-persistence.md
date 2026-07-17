# Phase 1 — Collaboration Persistence · Task-Level Implementation Plan

**Roadmap ref:** [ENHANCEMENT_ROADMAP.md](../ENHANCEMENT_ROADMAP.md) Phase 1 · **Priority:** P0 · **Status:** 🟡 In progress (core landed) · **Last updated:** 2026-07-17

> **Goal:** make the **Yjs document the single durable source of truth**, persisted
> **server-side** and independent of any connected client, so on-prem installs never lose
> or diverge edits. TipTap JSON becomes a **derived read-model**.

---

## 0. Status

Core server-side persistence (**Groups A + B**) is implemented and locally boot-verified;
the client-side cleanup and migration (**C/D/E**), config/docs (**F**), and tests (**G**)
remain.

| Group | Status | Notes |
|-------|--------|-------|
| A — Mongo persistence adapter | ✅ Done | `CollabState` model, schema-free `deriveContent`, `mongoPersistence` adapter |
| B — Wire into server | ✅ Done | `setPersistence(...)`; Mongo connects before `listen` |
| C — Server-derived read-model | ⬜ Not started | Adapter already derives `content`/`plainText`; still need to deprecate client JSON writes |
| D — Legacy migration (guarded seed) | ⬜ Not started | Adapter has legacy `CollabSnapshot` fallback; guarded client seed endpoint pending |
| E — Retire client-driven persistence | ⬜ Not started | Client snapshot/auto-save loop still runs (harmless, coexists) |
| F — Config & docs | ⬜ Not started | — |
| G — Tests & verification | 🟡 Partial | `tsc` passes; clean boot verified; unit + 2-client/restart e2e pending |

**Verified so far:** `tsc --noEmit` passes; server boots with `Collab persistence: MongoDB
enabled`; fixed a yjs ESM/CJS dual-instance bug by loading `yjs`/`y-prosemirror` via
`createRequire` (shares the vendored `utils.cjs` instance).

**Delivered (not in the original plan) — pnpm 11 build approval:** added `allowBuilds` to
`pnpm-workspace.yaml` (esbuild only) so `pnpm` scripts run under pnpm 11 / Node 24.

---

## 1. Current State (what we're replacing)

Persistence today is **client-driven and fragile**:

| Where | What it does | File |
|-------|--------------|------|
| Client mount | `GET /api/collab/snapshot/:room` → `initialStorageState` → `Y.applyUpdate` | [EditorView.vue:135-152](../../apps/demo/src/components/EditorView.vue), [Collaboration.ts:52-54](../../packages/core/src/Collaboration.ts) |
| Client, every 30s + on unmount | `POST /api/collab/snapshot` with full encoded ydoc | [EditorView.vue:101-133,154-161](../../apps/demo/src/components/EditorView.vue) |
| Client `onUpdate` | `POST /api/collab/auto-save` / `PUT /api/documents/:id` saves TipTap JSON | [collab.ts](../../apps/server/src/routes/collab.ts), [documents.ts](../../apps/server/src/routes/documents.ts) |
| WS server | **No persistence** — `YPERSISTENCE` unset → `persistence = null` | [utils.cjs:24-46](../../apps/server/src/y-websocket/utils.cjs) |

**Failure modes:**
- Server restart / crash with no client mid-save → **in-memory ydoc lost**.
- Three representations diverge: `Document.content` (JSON), `CollabSnapshot.yDocState` (binary), live ydoc.
- Concurrent clients each POST the whole state → races on one Mongo doc.

**Key existing hooks we build on:**
- `utils.cjs` already exposes `setPersistence({ bindState, writeState, provider })` ([utils.cjs:53](../../apps/server/src/y-websocket/utils.cjs)); `getYDoc` calls `bindState` on doc creation ([utils.cjs:164-173](../../apps/server/src/y-websocket/utils.cjs)); `writeState` is called on **last disconnect only** ([utils.cjs:223-228](../../apps/server/src/y-websocket/utils.cjs)).
- Room id = `doc-<mongoId>` (or `default`); `canAccessRoom` strips the `doc-` prefix ([index.ts:80-93](../../apps/server/src/index.ts)).
- `extractPlainText(json)` already exists ([Document.ts](../../apps/server/src/models/Document.ts)).

---

## 2. Target Architecture

```
          ┌─────────── WS server (single authority) ───────────┐
 clients ─┤  in-memory Y.Doc  ⇄  Mongo-backed persistence       │
          │       │                    ▲          │             │
          │   bindState (load)   debounced write  writeState    │
          │                            │       (last disconnect)│
          └────────────────────────────┼────────────────────────┘
                                        ▼
                       CollabState { roomId, state(Buffer) }   ← authoritative (Yjs binary)
                       Document    { content(JSON), plainText } ← derived read-model
```

**Design decisions:**

1. **Server-authoritative, single instance.** One WS server owns the live doc. Multi-instance
   horizontal scaling (shared pub/sub) is **out of scope** — note it; on-prem is single-server.
2. **Read derivation is schema-free.** `yXmlFragmentToProsemirrorJSON(ydoc.getXmlFragment('default'))`
   (from `y-prosemirror`) converts ydoc → PM JSON **without** a schema. `extractPlainText` gives
   search text. This is done server-side on every debounced write. **No TipTap schema needed on the server.**
3. **Seeding legacy docs (JSON → Yjs) needs a schema**, which the server lacks. Resolved by a
   **guarded, one-time, client-assisted seed** (see Task Group D) — the client has the schema.
4. **Writes happen twice:** debounced during editing (via a `ydoc.on('update')` listener attached
   in `bindState`) **and** a final flush in `writeState` on last disconnect. No edit to the
   vendored `utils.cjs` is required — we supply a complete persistence object via `setPersistence`.
5. **`CollabState` is authoritative; legacy `CollabSnapshot` becomes a read-only seed fallback**, then is removed.

---

## 3. Data Model

New Mongoose model `CollabState` ([apps/server/src/models/CollabState.ts](../../apps/server/src/models/CollabState.ts)):

```ts
interface ICollabState {
  roomId: string      // e.g. "doc-<mongoId>"; unique
  state: Buffer       // Y.encodeStateAsUpdate(ydoc)
  seeded: boolean     // true once migrated from legacy JSON (guards double-seed)
  updatedAt: Date
}
// unique index on roomId
```

`Document.content` / `Document.plainText` remain, but are **written only by the server** (derived), never by the client, for collaborative docs.

---

## 4. Task Breakdown

Tasks are grouped; each lists files, work, and acceptance. Dependencies noted as `⇐`.

### Group A — Mongo persistence adapter (library of the fix) · ✅ Done

**A1. Add `y-prosemirror` to the server.** ⇐ none
- File: [apps/server/package.json](../../apps/server/package.json)
- Add `"y-prosemirror": "^1.2.12"` to `dependencies`; `pnpm install`.
- Accept: `import { yXmlFragmentToProsemirrorJSON } from 'y-prosemirror'` resolves in the server build.

**A2. `CollabState` model.** ⇐ none
- File: `apps/server/src/models/CollabState.ts` (new) — schema from §3, unique `roomId` index.
- Accept: model compiles; `typecheck` passes.

**A3. Derivation helper.** ⇐ A1
- File: `apps/server/src/y-websocket/deriveContent.ts` (new)
- `deriveDocument(ydoc): { content: object; plainText: string }` using `yXmlFragmentToProsemirrorJSON(ydoc.getXmlFragment('default'))` + `extractPlainText`.
- Guard empty fragment → `{ type: 'doc', content: [{ type: 'paragraph' }] }`.
- Accept: unit test converts a known ydoc → expected JSON + plainText (Group G).

**A4. The persistence adapter.** ⇐ A1, A2, A3
- File: `apps/server/src/y-websocket/mongoPersistence.ts` (new). Exports `createMongoPersistence()` returning `{ bindState, writeState, provider: null }`.
  - `bindState(docName, ydoc)`:
    1. Load `CollabState.state` for `docName`; if present → `Y.applyUpdate(ydoc, state)`.
    2. Else load legacy `CollabSnapshot.yDocState`; if present → apply, and write-through to `CollabState`.
    3. Attach `ydoc.on('update', () => scheduleWrite(docName, ydoc))`.
  - `scheduleWrite`: per-`docName` `lodash.debounce` (already a server dep), ~2–3s trailing. Keep debouncers in a `Map<string, DebouncedFn>`.
  - `writeState(docName, ydoc)`: cancel/flush the pending debounce, then `await persist(docName, ydoc)`.
  - `persist(docName, ydoc)`:
    - `state = Y.encodeStateAsUpdate(ydoc)` → upsert `CollabState { roomId, state, updatedAt }`.
    - `docId = docName.replace(/^doc-/, '')`; if valid ObjectId → `deriveDocument(ydoc)` → update `Document.content` + `plainText`.
    - Wrap in try/catch + structured log; never throw into the WS server loop.
- Accept: unit test — apply updates, run `persist`, assert `CollabState` + `Document.content` updated.

### Group B — Wire persistence into the server · ✅ Done

**B1. Register the adapter.** ⇐ A4
- File: [apps/server/src/index.ts](../../apps/server/src/index.ts)
- From the existing `require(utilsPath)`, also pull `setPersistence`; call `setPersistence(createMongoPersistence())`.
- **Reorder `start()`**: `await mongoose.connect(...)` **before** `server.listen(...)`, then `setPersistence(...)`, so `bindState` queries work on the first connection (avoid relying on mongoose command buffering). Keep the Mongo-unavailable warning path.
- Accept: on boot, logs "collab persistence: mongo enabled"; connecting to a room with stored state loads it.

**B2. Confirm gc + last-disconnect flush interplay.** ⇐ B1
- `utils.cjs` deletes the doc from memory after `writeState` on last disconnect ([utils.cjs:223-228](../../apps/server/src/y-websocket/utils.cjs)). Ensure `writeState` cancels the per-doc debouncer so no post-deletion stale write fires; re-connection re-runs `bindState` (fresh load).
- Accept: open→edit→close→reopen shows last state; no "write after delete" errors in logs.

### Group C — Server-derived read-model (search & list stay correct)

**C1. Stop client JSON writes for collaborative docs.** ⇐ B1
- The server now owns `Document.content`/`plainText` via `persist`. Mark `POST /api/collab/auto-save` deprecated (Group E removes it).
- Accept: editing a collab doc updates `Document.plainText` server-side within one debounce window; text search finds new content with no client save call.

**C2. Keep single-user (non-collab) docs on `onUpdate`.** ⇐ none
- Non-collaborative editing still persists via `onUpdate` → `PUT /api/documents/:id`. Document this split clearly (collab ⇒ server-derived; solo ⇒ `onUpdate`).
- Accept: a non-collab doc still saves via `PUT`.

### Group D — Legacy document migration (JSON → Yjs, one-time, guarded)

> Needed because docs that were never collaborated have only `Document.content` (JSON) and no
> Yjs state; a first WS connection would otherwise show an **empty** doc. Server can't seed
> (no schema), so the first client seeds — exactly once.

**D1. Guarded seed endpoint.** ⇐ A2, B1
- File: [apps/server/src/routes/collab.ts](../../apps/server/src/routes/collab.ts)
- `POST /api/collab/seed { roomId, state: number[] }` (auth + room-access checked):
  - Atomic guard: `CollabState.updateOne({ roomId, seeded: { $ne: true } }, { $set: { state, seeded: true, updatedAt }, $setOnInsert: { roomId } }, { upsert: true })`. Unique `roomId` index guarantees only the first concurrent caller wins.
  - On success, apply the seed to the live in-memory doc: `Y.applyUpdate(getYDoc(roomId), Uint8Array.from(state))` so already-connected clients converge.
- Accept: two clients racing to seed → exactly one `CollabState` row, no duplicated content.

**D2. Client first-writer seed.** ⇐ D1
- File: [apps/demo/src/components/EditorView.vue](../../apps/demo/src/components/EditorView.vue) (and later `apps/web`)
- After the provider fires `synced`, if `ydoc.getXmlFragment('default').length === 0` **and** the fetched `Document.content` is non-empty: build a temp ydoc from `Document.content` (client has the schema via `prosemirrorJSONToYXmlFragment`), `encodeStateAsUpdate`, `POST /api/collab/seed`. Do **not** apply locally first (avoid double-seed) — let the server's applied update sync back.
- Accept: opening a legacy JSON-only doc shows its content and creates a `CollabState`; reopening loads from server with no reseed.

**D3. Backfill note.** ⇐ D1
- Existing `CollabSnapshot` rows are consumed by `bindState` fallback (A4) and write-through to `CollabState`. No offline batch job required; document that migration is lazy on first open.
- Accept: a doc with a legacy `CollabSnapshot` loads correctly and gains a `CollabState` row after first open.

### Group E — Retire client-driven persistence

**E1. Remove client snapshot/auto-save.** ⇐ B1, D2
- File: [apps/demo/src/components/EditorView.vue](../../apps/demo/src/components/EditorView.vue)
- Delete `saveCollabSnapshot`, `startAutoSave`/`stopAutoSave`, the 30s timer, the unmount save, and the mount `GET /api/collab/snapshot` load (replaced by server sync + D2 seed). Keep the **presence heartbeat** (separate concern).
- Accept: no `/api/collab/snapshot` calls in the network tab during a session; edits still persist.

**E2. Remove legacy routes.** ⇐ E1, and after a deprecation window
- File: [apps/server/src/routes/collab.ts](../../apps/server/src/routes/collab.ts)
- Remove `POST/GET /api/collab/snapshot` and `POST /api/collab/auto-save` and the `CollabSnapshot` model once no client references remain and backfill (D3) is confirmed.
- Accept: routes gone; `grep` finds no client callers; app works.

### Group F — Config & docs

**F1. Env + deployment.** ⇐ B1
- Files: [docker/server.env.example](../../docker/server.env.example), [.env.docker.example](../../.env.docker.example)
- Document that persistence is Mongo-backed and automatic (no `YPERSISTENCE`). Add `COLLAB_WRITE_DEBOUNCE_MS` (default 2500) if we expose it.
- Accept: env examples describe the new behavior.

**F2. Update CLAUDE.md note.** ⇐ B1
- Correct the collaboration/persistence description in [CLAUDE.md](../../CLAUDE.md) to "Yjs is authoritative, persisted server-side to Mongo (`CollabState`); `Document.content` is a derived read-model."
- Accept: doc matches new reality.

### Group G — Tests & verification

**G1. Unit tests.** ⇐ A3, A4
- `deriveDocument` (ydoc → JSON/plainText); adapter `persist` (writes `CollabState` + derived `Document`); seed-guard atomicity (two concurrent `updateOne`s → one winner). Use `happy-dom`/mongodb-memory-server as available.

**G2. E2E — data integrity (the acceptance gate).** ⇐ all
- File: `e2e/collab-persistence.spec.ts` (new)
  - **Two-client convergence:** clients A+B edit the same room → both see merged result.
  - **Server-restart durability:** A edits, all clients disconnect, restart server, reconnect → last state present (no loss). *(Drive server restart via a test harness/script; if Playwright can't restart the server, script it in a Node integration test.)*
  - **Derived consistency:** after a debounce window, `Document.content` matches the ydoc; text search finds new text.
  - **Legacy migration:** open a JSON-only doc → content appears, `CollabState` created, reopen does not reseed.
- Accept: all pass in CI.

---

## 5. Sequencing

```
A1─A2─A3─A4 ─► B1 ─► B2
                │
                ├─► C1, C2
                ├─► D1 ─► D2 ─► D3
                │              │
                └──────────────┴─► E1 ─► E2
B1 ─► F1, F2
A3/A4 ─► G1 ;  everything ─► G2
```

Land **A→B→G2 (two-client + restart)** first — that proves the core fix — then C/D/E cleanup,
then F. Do not remove legacy routes (E2) until the deprecation window and backfill (D3) confirm safety.

## 6. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| **Double-seed duplicates content** (two clients seed a legacy doc) | Atomic guarded upsert + unique `roomId` (D1); client seeds only when fragment empty post-`synced` and never applies locally first (D2). **Validate with G1 concurrency test — this is the #1 risk.** |
| `yXmlFragmentToProsemirrorJSON` output differs from client `getJSON()` (custom nodes: footnote, pageBreak, pagination) | Snapshot-compare derived JSON vs client JSON for a doc using each custom node (G1); pagination is a decoration, confirm it's not in the persisted fragment. |
| Debounced write fires after doc GC'd from memory | `writeState` cancels the debouncer (B2). |
| Mongo down at connection time | `bindState` try/catch → start empty rather than crash; log; existing Mongo-unavailable path preserved (B1). |
| Multi-instance deployment | Explicitly out of scope; documented single-server assumption (§2). |

## 7. Out of Scope (this phase)

- Named version history / restore (Phase 9 — the `HistorySidebar` is UI-only today).
- Horizontal multi-instance collab scaling.
- Moving image/asset bytes (Phase 4).
