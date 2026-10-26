import { Extension, type AnyExtension } from '@tiptap/core'
import { Collaboration } from '@tiptap/extension-collaboration'
import { yCursorPlugin } from '@tiptap/y-tiptap'
import { Awareness } from 'y-protocols/awareness'
import type { IndexeddbPersistence } from 'y-indexeddb'
import * as Y from 'yjs'
import { createAwarenessStates, type AwarenessState } from './collaborationAwareness.js'
import {
  createCollaborationProvider,
  whenProviderSynced,
  type CollaborationProvider,
} from './collaborationProviders.js'
import {
  attachOfflineMirror,
  deleteMirrorDatabase,
  resolveMirrorKey,
  type OfflineMirrorHandle,
  type OfflineMirrorWarning,
  type PurgeOfflineMirrorResult,
} from './offlineMirror.js'

export type { AwarenessState } from './collaborationAwareness.js'
export { resolveSignalingUrls } from './collaborationProviders.js'

export interface CollaborationOptions {
  room: string
  provider?: 'webrtc' | 'websocket'
  websocketUrl?: string
  signaling?: string[]
  user: { name: string; color: string }
  onAwarenessChange?: (states: AwarenessState[]) => void
  initialStorageState?: Uint8Array
  /**
   * Phase 9 PR2 — when false, the local user is treated as
   * out-of-editor: their cursor field is nulled and `present` is false.
   * Default is true (in editor). Toggle at runtime via
   * `setLocalCursorEnabled()` returned from `createCollaboration`.
   */
  emitCursor?: boolean
  /**
   * Phase 9 OF1 — when true, mirror the room's Y.Doc into IndexedDB
   * (`docflow-<room>`) via y-indexeddb so edits survive offline and reload.
   * Reconcile-on-reconnect is plain Yjs merge — no conflict resolution
   * needed. The IndexedDB mirror is NEVER a seed source: the server (or the
   * legacy-JSON seed path) still owns initial state; the mirror only
   * contributes local offline edits via the normal Yjs update exchange.
   */
  offline?: boolean
  /**
   * Issue #162 — IndexedDB database name for the offline mirror. Defaults to
   * `docflow-<room>`, which every identity on the same browser profile
   * shares. Hosts that support account switching SHOULD scope this per
   * user/tenant (e.g. `docflow-<tenant>-<userId>-<room>`) and purge on
   * logout / role downgrade.
   */
  mirrorKey?: string
  /**
   * Issue #162 — typed offline-mirror warnings (`quota-high`,
   * `quota-exceeded`, `mirror-unavailable`). Without a handler the library
   * logs once per code via `console.warn`.
   */
  onOfflineWarning?: (warning: OfflineMirrorWarning) => void
  /**
   * Issue #162 — fraction of the origin storage quota at which a
   * `quota-high` warning fires. Default 0.9. Advisory only: it never blocks
   * attach or hydration.
   */
  quotaWarnRatio?: number
}

export interface CollaborationSetup {
  ydoc: Y.Doc
  provider: CollaborationProvider | null
  awareness: Awareness
  /**
   * Phase 9 OF1 — y-indexeddb persistence instance, present only when
   * `options.offline` is true. Exposed so hosts/tests can `await
   * persistence.whenSynced` before asserting the mirror contents. Do not
   * use it as a seed source.
   */
  persistence?: IndexeddbPersistence
  /**
   * Issue #162 — the IndexedDB database backing the mirror. `undefined` when
   * `offline` is false. Use it in "clear local data" UI.
   */
  mirrorDatabase?: string
  /**
   * Issue #162 — close the live mirror connection and delete its database.
   * Destructive: call only after local edits reached the server (logout,
   * account switch, downgrade to viewer, access revoked). Optional so custom
   * `CollaborationSetup` objects stay valid; `createCollaboration` always
   * provides it.
   */
  purgeOfflineMirror?: () => Promise<PurgeOfflineMirrorResult>
  /**
   * Issue #117 — resolves after BOTH the offline mirror (if `offline`) AND
   * the provider's first sync (if `websocket`) have completed. Hosts MUST
   * `await setup.whenReady` before binding the editor, otherwise the
   * TipTap view can render against the IndexedDB cache before the
   * authoritative server state arrives, briefly showing — and on a
   * disconnected peer potentially re-broadcasting — nodes the server has
   * since deleted. Resolves immediately when neither side applies.
   */
  whenReady: Promise<void>
  destroy: () => void
  /**
   * Phase 9 PR2 — toggle the local cursor emission + present flag.
   * Pass `false` when the editor route unmounts, `true` when it remounts.
   * Triggers an awareness `change` event so peers see the leave/rejoin
   * instantly (no REST-heartbeat lag).
   */
  setLocalCursorEnabled: (enabled: boolean) => void
}

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

  // Phase 9 PR2 — emitCursor gate. Local cursor is published only when
  // the host has set `emitCursor: true` (default). When toggled off via
  // `setLocalCursorEnabled(false)`, we clear `cursor` so peers don't paint a
  // phantom one. The awareness `change` event fires on each toggle so peers
  // stop receiving cursor updates within one round-trip.
  let emitCursor = options.emitCursor ?? true
  const setLocalCursorEnabled = (enabled: boolean) => {
    if (emitCursor === enabled) return
    emitCursor = enabled
    // When leaving: clear the cursor so peers don't paint a phantom one.
    // When returning: leave the cursor field alone — the CollaborationCursor
    // extension will repopulate it on the next selection change.
    if (!enabled) {
      awareness.setLocalStateField('cursor', null)
    }
    // Publish the gate as its own awareness field so `isLocalCursorEnabled()`
    // can read it without a parallel copy. `present` is intentionally NOT
    // tied to this gate: tab visibility changes call this on every hidden
    // tab, and flipping `present` here made peers' avatars flash off (Phase 9
    // PR2 regression). The real "left the doc" signal is unmount →
    // `destroy()` → `setLocalState(null)`, which propagates in one round-trip.
    awareness.setLocalStateField('emitCursor', enabled)
  }
  awareness.setLocalStateField('present', true)
  awareness.setLocalStateField('emitCursor', emitCursor)

  let awarenessHandler: (() => void) | undefined
  if (options.onAwarenessChange) {
    const notify = () => {
      options.onAwarenessChange?.(createAwarenessStates(awareness))
    }
    awarenessHandler = notify
    awareness.on('change', notify)
    notify()
  }

  // Issue #117 — gate editor binding until both the offline mirror and the
  // websocket provider have completed their first sync. We do not stall the
  // Yjs setup itself; the doc, provider, and mirror remain constructed and
  // may exchange updates freely. We only expose a `whenReady` promise that
  // hosts must await before mounting the TipTap editor. Without this gate
  // the editor binds to the Y.Doc the moment it exists, which on a
  // disconnected-and-rejoining peer renders the IndexedDB cache before the
  // server's authoritative state-vector arrives — a window during which
  // deleted nodes appear, and any cached-but-not-yet-known state can be
  // rebroadcast to peers on the next delta. The fix is structural: the
  // mirror contributes offline edits via the normal Yjs merge on the WS
  // sync; we just delay the editor's view until that exchange has settled.
  const readyParts: Promise<void>[] = []
  if (offlineMirror) {
    readyParts.push(offlineMirror.whenSettled)
  }
  if (provider) {
    readyParts.push(whenProviderSynced(provider))
  }
  const whenReady = readyParts.length === 0
    ? Promise.resolve()
    : Promise.all(readyParts).then(() => undefined)

  // Issue #162 — destructive, host-initiated mirror purge. Closes the live
  // connection first so the delete is not blocked by our own handle, then
  // removes the database. Mirrors are per-room/per-key, not per-identity.
  const purgeOfflineMirror = async (): Promise<PurgeOfflineMirrorResult> => {
    const database = offlineMirror?.database ?? resolveMirrorKey(options.room, options.mirrorKey)
    if (persistence) {
      await persistence.destroy().catch(() => undefined)
    }
    offlineMirror?.dispose()
    return deleteMirrorDatabase(database)
  }

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
    setLocalCursorEnabled,
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

/**
 * Remote-cursor extension.
 *
 * TipTap v3 moved its Yjs integration to the `@tiptap/y-tiptap` fork, and the
 * standalone `@tiptap/extension-collaboration-cursor` package has no v3 release:
 * its `3.0.0` build is a mis-tagged 2.5.0 ("we meant to release 2.5.0") that
 * still registers `y-prosemirror`'s cursor plugin. Under v3's editor mount the
 * cursor plugin's `init` runs before the fork's `y-sync$` state exists, so it
 * throws `Cannot read properties of undefined (reading 'doc')` and the editor
 * never mounts. Until upstream ships a v3 cursor extension, docflow registers
 * the fork's own `yCursorPlugin` — the awareness contract is unchanged
 * (`user` / `cursor` fields, as published by `createCollaboration`).
 */
const CollaborationCursor = Extension.create<{
  provider: { awareness: Awareness } | null
  user: { name: string; color: string }
}>({
  name: 'collaborationCursor',
  addOptions() {
    return { provider: null, user: { name: '', color: '' } }
  },
  addProseMirrorPlugins() {
    const awareness = this.options.provider?.awareness
    if (!awareness) return []
    return [yCursorPlugin(awareness)]
  },
})

export function collaborationExtensions(
  options: CollaborationOptions | CollaborationSetup,
): AnyExtension[] {
  const setup = 'ydoc' in options ? options : createCollaboration(options)

  const extensions: AnyExtension[] = [
    Collaboration.configure({ document: setup.ydoc }),
  ]

  if (setup.provider) {
    extensions.push(
      CollaborationCursor.configure({
        provider: setup.provider,
        user: setup.awareness.getLocalState()?.user ?? { name: '', color: '' },
      }),
    )
  }

  return extensions
}
