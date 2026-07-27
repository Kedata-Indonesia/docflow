import type { AnyExtension } from '@tiptap/core'
import { Collaboration } from '@tiptap/extension-collaboration'
import { CollaborationCursor } from '@tiptap/extension-collaboration-cursor'
import { Awareness } from 'y-protocols/awareness'
import { IndexeddbPersistence } from 'y-indexeddb'
import { WebrtcProvider } from 'y-webrtc'
import { WebsocketProvider } from 'y-websocket'
import * as Y from 'yjs'

export interface AwarenessState {
  clientId: number
  user: { name: string; color: string }
  cursor?: { from: number; to: number } | null
  /**
   * Phase 9 PR2 — *present* flag. False when the local user has navigated
   * away from the editor route (the Yjs provider is still alive but the
   * host has gated cursor emission off, per the §6 *\"TOC sidebar orphan
   * wiring\"* / REST-heartbeat scope notes). Peers see this instantly
   * via the awareness `change` event — far faster than the 15s REST
   * heartbeat fallback. Defaults to true when the user is in the editor.
   */
  present: boolean
}

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
}

export interface CollaborationSetup {
  ydoc: Y.Doc
  provider: WebrtcProvider | WebsocketProvider | null
  awareness: Awareness
  /**
   * Phase 9 OF1 — y-indexeddb persistence instance, present only when
   * `options.offline` is true. Exposed so hosts/tests can `await
   * persistence.whenSynced` before asserting the mirror contents. Do not
   * use it as a seed source.
   */
  persistence?: IndexeddbPersistence
  destroy: () => void
  /**
   * Phase 9 PR2 — toggle the local cursor emission + present flag.
   * Pass `false` when the editor route unmounts, `true` when it remounts.
   * Triggers an awareness `change` event so peers see the leave/rejoin
   * instantly (no REST-heartbeat lag).
   */
  setLocalCursorEnabled: (enabled: boolean) => void
}

/** Local-only signaling default. Public signaling servers were removed in
 * Phase 2 — the library must never contact external infrastructure on its own. */
const LOCAL_SIGNALING = ['ws://localhost:4444']

let warnedLocalSignaling = false

/**
 * Resolve webrtc signaling servers. Without an explicit `signaling` config the
 * provider is local-only (localhost + same-browser BroadcastChannel); warn once
 * so production self-host installs know to run their own signaling server or
 * use `provider: 'websocket'` instead.
 */
export function resolveSignalingUrls(signaling?: string[]): string[] {
  if (signaling && signaling.length > 0) return signaling
  if (!warnedLocalSignaling) {
    warnedLocalSignaling = true
    console.warn(
      '[docflow] webrtc provider has no `signaling` configured — falling back to ' +
        'localhost-only sync (ws://localhost:4444 + same-browser tabs). For production ' +
        'self-host, run your own signaling server and pass `signaling`, or use ' +
        '`provider: "websocket"` with your own websocketUrl.',
    )
  }
  return LOCAL_SIGNALING
}

interface AwarenessRawState {
  user?: { name: string; color: string }
  cursor?: { from: number; to: number } | null
  /** Phase 9 PR2 — see AwarenessState.present. Defaults to true when not
   *  explicitly set (legacy states that only carry `user` + `cursor`). */
  present?: boolean
}

const LOCAL_PRESENT_DEFAULT = true

function createAwarenessStates(awareness: Awareness): AwarenessState[] {
  const states: AwarenessState[] = []
  awareness.getStates().forEach((state: Record<string, unknown>, clientId: number) => {
    const raw = state as AwarenessRawState
    states.push({
      clientId,
      user: raw.user ?? { name: '', color: '' },
      cursor: raw.cursor ?? null,
      // `present` defaults to true for backwards compat (legacy states
      // don't set it) and for the local user (always considered present
      // until PR2 toggles it off).
      present: raw.present ?? LOCAL_PRESENT_DEFAULT,
    })
  })
  return states
}

export function createCollaboration(options: CollaborationOptions): CollaborationSetup {
  const ydoc = new Y.Doc()
  if (options.initialStorageState) {
    Y.applyUpdate(ydoc, options.initialStorageState)
  }
  // Phase 9 OF1 — opt-in offline mirror. y-indexeddb loads any previously
  // persisted state into the doc and writes every local update back to
  // IndexedDB (`docflow-<room>`). It never seeds: the server still owns
  // initial state; the mirror only carries local offline edits into the
  // normal Yjs merge on reconnect.
  let persistence: IndexeddbPersistence | undefined
  if (options.offline) {
    persistence = new IndexeddbPersistence(`docflow-${options.room}`, ydoc)
  }
  let provider: WebrtcProvider | WebsocketProvider | null = null

  if (options.provider === 'webrtc') {
    provider = new WebrtcProvider(options.room, ydoc, {
      signaling: resolveSignalingUrls(options.signaling),
    })
  } else if (options.provider === 'websocket') {
    if (!options.websocketUrl) {
      throw new Error('[Collaboration] websocketUrl is required when provider is "websocket"')
    }
    provider = new WebsocketProvider(options.websocketUrl, options.room, ydoc)
  }

  const awareness = provider?.awareness ?? new Awareness(ydoc)
  awareness.setLocalStateField('user', options.user)

  // Phase 9 PR2 — emitCursor gate. Local cursor is published only when
  // the host has set `emitCursor: true` (default). When toggled off via
  // `setLocalCursorEnabled(false)`, we (a) clear `cursor` (no remote
  // cursor paint), and (b) set `present: false` so peers can dim the
  // avatar. The awareness `change` event fires on each toggle so peers
  // see the leave/rejoin within one round-trip, no REST lag.
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
    awareness.setLocalStateField('present', enabled)
  }
  awareness.setLocalStateField('present', emitCursor)

  let awarenessHandler: (() => void) | undefined
  if (options.onAwarenessChange) {
    const notify = () => {
      options.onAwarenessChange?.(createAwarenessStates(awareness))
    }
    awarenessHandler = notify
    awareness.on('change', notify)
    notify()
  }

  const destroy = () => {
    if (awarenessHandler) {
      awareness.off('change', awarenessHandler)
    }
    awareness.setLocalState(null)
    ;(provider as { destroy?: () => void } | null)?.destroy?.()
    ;(awareness as { destroy?: () => void }).destroy?.()
    // Destroy the offline mirror before the doc so pending writes settle.
    void persistence?.destroy()
    ydoc.destroy()
  }

  return { ydoc, provider, awareness, persistence, destroy, setLocalCursorEnabled }
}

/**
 * Phase 9 PR2 — read the current emit-cursor gate. The host's editor
 * extension (or the CollaborationCursor ext itself) calls this to
 * decide whether to publish cursor updates. Default true. Used by the
 * host to short-circuit expensive `awareness.setLocalStateField('cursor', ...)`
 * calls when the user is out-of-editor.
 */
export function isLocalCursorEnabled(setup: CollaborationSetup): boolean {
  // Read the local state to keep the gate in a single place; the
  // `present` field doubles as the gate (false = no cursor either).
  return setup.awareness.getLocalState()?.present !== false
}

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
