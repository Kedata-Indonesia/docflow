# Evidence — offline mirror lifecycle (#162)

**Branch:** `feat/162-offline-mirror-lifecycle`
**Base:** `main` @ `25415a1` (merge PR #409)
**Date:** 26 Oct 2026
**Kind:** library behaviour (no UI change) — evidence is terminal/test logs.

## Before vs after

| Area | Before | After |
|---|---|---|
| Deleting cached document bytes | No API. `destroy()` only closes the IndexedDB connection; bytes stay forever. Repo search for `clearData`/`deleteDB` returned zero hits. | `purgeOfflineMirror({ room, mirrorKey? })` (works without a live editor) and `CollaborationSetup.purgeOfflineMirror()` (closes the connection first). Returns `deleted \| blocked \| unavailable \| error`. |
| Mirror key scope | Always `docflow-<room>`; every identity on the browser profile shares one cache. | New `mirrorKey` option; default stays `docflow-<room>` for back-compat, so hosts can scope per tenant/user. |
| Quota visibility | Silent and unbounded. | `onOfflineWarning` receives typed `quota-high` (pre-flight `navigator.storage.estimate()`), `quota-exceeded` (scoped `unhandledrejection` filter), and `mirror-unavailable` (DB open failure). Console fallback, once per code. |
| Vue re-init | Watcher only keyed on `room` + `provider`; changing identity scope reused the old cache. | Watcher key includes `offline` + `mirrorKey`. |
| Docs | Risk noted as "tracked in #162". | `LIBRARY_CONTRACT.md` §2.1 documents the API; `COLLAB_INTEGRATION.md` has the purge policy matrix + examples; plan archived in `docs/plans/offline-mirror-lifecycle-162.md`. |

## Tests

Command:

```bash
pnpm --filter @kedata-indonesia/docflow-core test:unit
```

Result: **20 files, 186 tests passed** (new suite: `offlineMirrorLifecycle.test.ts`, 9 tests).

Covered scenarios:

1. Default/blank `mirrorKey` resolves to `docflow-<room>`; explicit key is trimmed.
2. Standalone purge deletes the DB and a fresh mount starts empty.
3. Live-setup purge deletes the DB, later edits are not persisted, `destroy()` stays safe.
4. Two identities with different `mirrorKey` do not inherit each other's content.
5. Pre-downgrade cached edits do not re-merge after a purge.
6. `quota-high` warning fires without blocking attach.
7. `QuotaExceededError` produces exactly one warning and the listener detaches on destroy.
8. A delete request that never settles resolves `blocked` after the timeout.
9. A failing delete resolves `error` with the underlying message.

## Static checks

| Command | Result |
|---|---|
| `pnpm --filter @kedata-indonesia/docflow-core typecheck` | pass |
| `pnpm --filter @kedata-indonesia/docflow-vue typecheck` | pass |
| `pnpm lint` | pass (0 warnings) |
| `pnpm docs:check` | pass — 43 files, no broken links |
| `pnpm docs:api:check` | pass — README up to date |

## How to test (QA)

Library-only change; use DevTools → Application → IndexedDB.

1. Mount the editor with `offline: true` and a scoped `mirrorKey`; type a paragraph.
2. Confirm the database appears under IndexedDB with the expected name.
3. Call `purgeOfflineMirror({ room, mirrorKey })` (or `editor.collab?.purgeOfflineMirror?.()`).
4. Confirm the database disappears and the result is `{ status: 'deleted' }`.
5. Remount the editor with the same key; the document should come from the server, not the cache.
6. Repeat while another tab holds the same room: expect `blocked` if the other tab does not close within `timeoutMs`; the tab that used `y-indexeddb` closes its connection automatically and loses its offline buffer (expected, documented).

## Files affected

| File | Role |
|---|---|
| `packages/core/src/offlineMirror.ts` (new) | key resolution, purge/delete, quota warnings |
| `packages/core/src/Collaboration.ts` | new options, attach via helper, `mirrorDatabase`, setup purge |
| `packages/core/src/collaborationProviders.ts` (new) | provider/signaling wiring + websocket sync gate (extracted) |
| `packages/core/src/collaborationAwareness.ts` (new) | `AwarenessState` + snapshot mapping (extracted) |
| `packages/core/src/index.ts` | public exports |
| `packages/vue/src/composables/useEditor.ts` | watcher key includes offline scope |
| `packages/core/src/__tests__/offlineMirrorLifecycle.test.ts` (new) | 9 lifecycle tests |
| `docs/reference/LIBRARY_CONTRACT.md` | option table + purge API |
| `docs/guides/COLLAB_INTEGRATION.md` | purge policy + examples |
| `docs/plans/offline-mirror-lifecycle-162.md` (new) | implementation plan |
| `CHANGELOG.md` | unreleased entry |
