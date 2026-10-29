import type { Awareness } from 'y-protocols/awareness'
import type { IndexeddbPersistence } from 'y-indexeddb'
import type * as Y from 'yjs'
import type { AwarenessState } from './collaborationAwareness.js'
import type { CollaborationProvider } from './collaborationProviders.js'
import type { OfflineMirrorWarning, PurgeOfflineMirrorResult } from './offlineMirror.js'

export interface CollaborationOptions {
  room: string
  provider?: 'webrtc' | 'websocket'
  websocketUrl?: string
  signaling?: string[]
  user: { name: string; color: string }
  onAwarenessChange?: (states: AwarenessState[]) => void
  initialStorageState?: Uint8Array
  /**
   * Phase 9 PR2 — when false, the local user's cursor field is nulled and the
   * `emitCursor` awareness field flips to false, so peers stop painting a
   * phantom caret while the tab is hidden. It does NOT clear `present`: the
   * user is still in the document. Default is true (publishing cursors).
   * Toggle at runtime via `setLocalCursorEnabled()` returned from
   * `createCollaboration`.
   */
  emitCursor?: boolean
  /**
   * Issue #117 — how long `whenReady` waits for the websocket provider's
   * first sync before giving up and letting the editor mount. Default 5000ms.
   * A wedged connection must not keep the editor blank forever.
   */
  syncTimeoutMs?: number
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
   * Phase 9 PR2 — toggle local cursor emission (`emitCursor` + `cursor`).
   * Pass `false` when the tab goes hidden, `true` when it comes back.
   * Triggers an awareness `change` event so peers see the gate flip
   * instantly (no REST-heartbeat lag). Does not clear `present`: leaving the
   * document is `destroy()` → `setLocalState(null)`.
   */
  setLocalCursorEnabled: (enabled: boolean) => void
}
