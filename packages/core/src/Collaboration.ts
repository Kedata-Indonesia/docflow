import { Awareness } from 'y-protocols/awareness'
import * as Y from 'yjs'
import { createAwarenessStates } from './collaborationAwareness.js'
import { createCursorGate } from './collaborationCursorGate.js'
import {
  createCollaborationProvider,
  whenProviderSynced,
  type CollaborationProvider,
} from './collaborationProviders.js'
import type { CollaborationOptions, CollaborationSetup } from './collaborationTypes.js'
import {
  attachOfflineMirror,
  deleteMirrorDatabase,
  resolveMirrorKey,
  type OfflineMirrorHandle,
  type PurgeOfflineMirrorResult,
} from './offlineMirror.js'

export type { AwarenessState } from './collaborationAwareness.js'
export type { CollaborationOptions, CollaborationSetup } from './collaborationTypes.js'
export { collaborationExtensions } from './collaborationCursor.js'
export { resolveSignalingUrls } from './collaborationProviders.js'

/** Issue #117 — how long `whenReady` waits for the first websocket sync. */
const DEFAULT_SYNC_TIMEOUT_MS = 5000

/**
 * Wire a room: Y.Doc, optional offline mirror, transport provider, awareness
 * (user + cursor gate), readiness gate, and teardown.
 *
 * Each concern lives in its own module (`collaborationProviders`,
 * `collaborationAwareness`, `collaborationCursorGate`, `offlineMirror`); this
 * function only sequences them and owns the handles.
 */
export function createCollaboration(options: CollaborationOptions): CollaborationSetup {
  const ydoc = new Y.Doc()
  if (options.initialStorageState) {
    Y.applyUpdate(ydoc, options.initialStorageState)
  }

  // Phase 9 OF1 — opt-in offline mirror. y-indexeddb loads any previously
  // persisted state into the doc and writes every local update back to
  // IndexedDB (`docflow-<room>` by default). It never seeds: the server still
  // owns initial state; the mirror only carries local offline edits into the
  // normal Yjs merge on reconnect. Issue #162 moved the lifecycle (key
  // resolution, purge, quota warnings) into `offlineMirror.ts`.
  const offlineMirror: OfflineMirrorHandle | undefined = options.offline
    ? attachOfflineMirror(ydoc, {
        database: resolveMirrorKey(options.room, options.mirrorKey),
        quotaWarnRatio: options.quotaWarnRatio,
        onWarning: options.onOfflineWarning,
      })
    : undefined
  const persistence = offlineMirror?.persistence
  const provider = createCollaborationProvider(ydoc, options)

  const awareness = provider?.awareness ?? new Awareness(ydoc)
  awareness.setLocalStateField('user', options.user)
  awareness.setLocalStateField('present', true)
  const cursorGate = createCursorGate(awareness, options.emitCursor ?? true)

  const awarenessHandler = subscribeAwareness(awareness, options.onAwarenessChange)
  const whenReady = createReadyGate(offlineMirror, provider, options.syncTimeoutMs)
  const purgeOfflineMirror = createMirrorPurge(offlineMirror, options)

  const destroy = () => {
    if (awarenessHandler) {
      awareness.off('change', awarenessHandler)
    }
    awareness.setLocalState(null)
    ;(provider as { destroy?: () => void } | null)?.destroy?.()
    ;(awareness as { destroy?: () => void }).destroy?.()
    // Destroy the offline mirror before the doc so pending writes settle.
    void persistence?.destroy().catch(() => undefined)
    offlineMirror?.dispose()
    ydoc.destroy()
  }

  return {
    ydoc,
    provider,
    awareness,
    persistence,
    mirrorDatabase: offlineMirror?.database,
    purgeOfflineMirror,
    whenReady,
    destroy,
    setLocalCursorEnabled: cursorGate.setEnabled,
  }
}

/**
 * Phase 9 PR2 — read the current emit-cursor gate. The host's editor
 * extension (or the CollaborationCursor ext itself) calls this to
 * decide whether to publish cursor updates. Default true. Used by the
 * host to short-circuit expensive `awareness.setLocalStateField('cursor', ...)`
 * calls when the user is out-of-editor.
 */
export function isLocalCursorEnabled(setup: CollaborationSetup): boolean {
  // Read the dedicated `emitCursor` field (the gate set by
  // `setLocalCursorEnabled`). We deliberately do NOT use `present` here:
  // `present` is lifetime-true until `destroy()` (it signals "is the user
  // still in the doc"), while `emitCursor` flips on visibility/tab-switch
  // (it signals "should we publish cursor updates right now").
  return setup.awareness.getLocalState()?.emitCursor !== false
}

/** Bridge awareness `change` events to the host callback (pay-per-change). */
function subscribeAwareness(
  awareness: Awareness,
  onChange: CollaborationOptions['onAwarenessChange'],
): (() => void) | undefined {
  if (!onChange) return undefined
  const notify = () => {
    onChange(createAwarenessStates(awareness))
  }
  awareness.on('change', notify)
  notify()
  return notify
}

/**
 * Issue #117 — gate editor binding until both the offline mirror and the
 * websocket provider have completed their first sync. We do not stall the
 * Yjs setup itself; the doc, provider, and mirror remain constructed and
 * may exchange updates freely. We only expose a `whenReady` promise that
 * hosts must await before mounting the TipTap editor. Without this gate
 * the editor binds to the Y.Doc the moment it exists, which on a
 * disconnected-and-rejoining peer renders the IndexedDB cache before the
 * server's authoritative state-vector arrives — a window during which
 * deleted nodes appear, and any cached-but-not-yet-known state can be
 * rebroadcast to peers on the next delta. The fix is structural: the
 * mirror contributes offline edits via the normal Yjs merge on the WS
 * sync; we just delay the editor's view until that exchange has settled.
 */
function createReadyGate(
  offlineMirror: OfflineMirrorHandle | undefined,
  provider: CollaborationProvider | null,
  syncTimeoutMs: number | undefined,
): Promise<void> {
  const readyParts: Promise<void>[] = []
  if (offlineMirror) {
    readyParts.push(offlineMirror.whenSettled)
  }
  if (provider) {
    const timeout = syncTimeoutMs ?? DEFAULT_SYNC_TIMEOUT_MS
    readyParts.push(whenProviderSynced(provider, timeout))
  }
  if (readyParts.length === 0) return Promise.resolve()
  return Promise.all(readyParts).then(() => undefined)
}

/**
 * Issue #162 — destructive, host-initiated mirror purge. Closes the live
 * connection first so the delete is not blocked by our own handle, then
 * removes the database. Mirrors are per-room/per-key, not per-identity.
 *
 * When the setup has no mirror (`offline: false`) this still resolves the
 * room's database name and deletes it: the host explicitly asked to drop
 * this room's local bytes, and a database opened elsewhere in the browser
 * comes back as `blocked` instead of being deleted under a live connection.
 */
function createMirrorPurge(
  offlineMirror: OfflineMirrorHandle | undefined,
  options: CollaborationOptions,
): () => Promise<PurgeOfflineMirrorResult> {
  return async () => {
    const database = offlineMirror?.database ?? resolveMirrorKey(options.room, options.mirrorKey)
    if (offlineMirror) {
      await offlineMirror.persistence.destroy().catch(() => undefined)
      offlineMirror.dispose()
    }
    return deleteMirrorDatabase(database)
  }
}
