# Offline mirror lifecycle — purge + quota guard (#162)

**Status:** in progress (implementation complete, pending review)
**Issue:** [#162 — feat(collab): offline mirror lifecycle](https://github.com/Kedata-Indonesia/docflow/issues/162)
**Touches:** [`docs/reference/LIBRARY_CONTRACT.md`](../reference/LIBRARY_CONTRACT.md) §2.1
(`CollaborationOptions`, offline mirror lifecycle), [`docs/guides/COLLAB_INTEGRATION.md`](../guides/COLLAB_INTEGRATION.md)
(new lifecycle section)

## Problem

Phase 9 OF1 attached an opt-in `y-indexeddb` mirror (`offline: true`) but shipped no
lifecycle: nothing deletes the database, the key `docflow-<room>` is shared by every
identity on the browser profile, cached state is merged into the live doc at
construction, and quota growth is unbounded and invisible. Details and code references
are in the issue body.

## Scope

In scope:

- `mirrorKey` option (default stays `docflow-<room>` for back-compat).
- `purgeOfflineMirror()` as a standalone export and as a `CollaborationSetup` method.
- Typed quota warnings: pre-flight `navigator.storage.estimate()` plus a scoped
  `unhandledrejection` listener for `QuotaExceededError` (y-indexeddb writes without
  awaiting the IDB request, so there is no public error hook).
- `mirror-unavailable` warning when the database cannot be opened.
- Docs policy + regression tests.

Out of scope (follow-ups if needed): automatic eviction/LRU, migrating existing mirrors to
a new key, encryption, and host-app wiring (`docflow-app`).

## API

```ts
interface CollaborationOptions {
  offline?: boolean
  mirrorKey?: string                       // default `docflow-<room>`
  onOfflineWarning?: (w: OfflineMirrorWarning) => void
  quotaWarnRatio?: number                  // default 0.9, advisory
}

type OfflineMirrorWarning =
  | { code: 'quota-high'; database: string; usage: number; quota: number; ratio: number }
  | { code: 'quota-exceeded'; database: string }
  | { code: 'mirror-unavailable'; database: string; error: Error }

type OfflineMirrorPurgeStatus = 'deleted' | 'blocked' | 'unavailable' | 'error'

interface PurgeOfflineMirrorResult {
  status: OfflineMirrorPurgeStatus
  database: string
  error?: Error
}

function purgeOfflineMirror(options: {
  room: string
  mirrorKey?: string
  timeoutMs?: number                       // default 2000ms
}): Promise<PurgeOfflineMirrorResult>

function resolveMirrorKey(room: string, mirrorKey?: string): string
```

`CollaborationSetup` gains optional `mirrorDatabase?: string` and
`purgeOfflineMirror?: () => Promise<PurgeOfflineMirrorResult>` (optional so hand-built
setups stay type-compatible; `createCollaboration` always provides them).

## Decisions

1. **Purge standalone is the primary surface.** Logout/account-switch happens after the
   editor may already be unmounted, so the API cannot require a live instance. The
   setup method is a convenience wrapper that closes the connection first.
2. **Deletion is implemented locally, not via `lib0.deleteDB`.** `lib0` only wires
   `onerror`/`onsuccess`, so a blocked deletion would hang forever. The wrapper handles
   `onblocked` + a timeout and reports a typed status.
3. **Quota pre-flight never delays attach.** The mirror still hydrates as before and
   `whenReady` semantics are unchanged; the warning is advisory.
4. **Write-time quota detection uses a scoped `unhandledrejection` listener** attached
   only while the mirror is alive, filtered by error name, deduped per code, removed in
   `dispose()`/`destroy()`. Documented as best-effort.
5. **Back-compat key.** `docflow-<room>` remains the default; per-user scoping is opt-in
   through `mirrorKey`. Hosts must use the same key when purging.
6. **No automatic deletion.** The library never decides that a local copy should
   disappear; the host policy matrix lives in the integration guide.

## Lifecycle

| Moment | Action |
|---|---|
| Logout | `purgeOfflineMirror({ room, mirrorKey })` |
| Account switch | purge + new scoped `mirrorKey` on the next mount |
| Downgrade to viewer/commenter | purge before remounting as read-only |
| Access revoked | purge on the auth callback that observes revocation |
| "Clear local data" UI | purge + surface `blocked` retry |
| Vue prop change | `useEditor` watcher now includes `offline` + `mirrorKey` so re-scoping rebuilds the editor |

Destructive-action caveat: purge only after local edits reached the server. Purging while
offline discards unsynced edits — stated in the guide.

## Implementation

| File | Change |
|---|---|
| `packages/core/src/offlineMirror.ts` (new) | key resolution, attach helper, purge/delete with blocked + timeout, quota pre-flight, quota-exceeded listener, typed warning emitter |
| `packages/core/src/Collaboration.ts` | options, attach through the helper, `mirrorDatabase`, `purgeOfflineMirror` method, dispose on destroy |
| `packages/core/src/index.ts` | export `purgeOfflineMirror`, `resolveMirrorKey`, types |
| `packages/vue/src/composables/useEditor.ts` | watcher key includes `offline` + `mirrorKey` |
| `packages/core/src/__tests__/offlineMirrorLifecycle.test.ts` (new) | 9 lifecycle tests |
| `docs/reference/LIBRARY_CONTRACT.md` | options, purge API, deviation #7 status |
| `docs/guides/COLLAB_INTEGRATION.md` | purge matrix, examples, quota warnings |

## Tests

| Scenario | Assertion |
|---|---|
| Standalone purge then remount | database gone, fresh mount empty |
| Live-setup purge | `deleted`, later edits not persisted, `destroy()` safe |
| Different `mirrorKey`, same room | identities isolated |
| Default key | `docflow-<room>`, blank key falls back |
| Downgrade | pre-downgrade cache does not re-merge after purge |
| Quota high | typed warning, attach not blocked |
| Quota exceeded | one warning, deduped, listener removed on destroy |
| Blocked delete | `blocked` after timeout |
| Failed delete | `error` + message |

## Verification

```
pnpm --filter @kedata-indonesia/docflow-core test:unit
pnpm --filter @kedata-indonesia/docflow-core typecheck
pnpm --filter @kedata-indonesia/docflow-vue typecheck
pnpm lint
pnpm docs:check
```

Evidence log: [`docs/evidence/162-offline-mirror-lifecycle/README.md`](../evidence/162-offline-mirror-lifecycle/README.md).
