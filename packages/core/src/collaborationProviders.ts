import { WebrtcProvider } from 'y-webrtc'
import { WebsocketProvider } from 'y-websocket'
import type * as Y from 'yjs'

/** Local-only signaling default. Public signaling servers were removed in
 * Phase 2 — the library must never contact external infrastructure on its own. */
const LOCAL_SIGNALING = ['ws://localhost:4444']

/** Issue #117 — how long to wait for the first websocket sync before mounting. */
const DEFAULT_SYNC_TIMEOUT_MS = 5000

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

export type CollaborationProvider = WebrtcProvider | WebsocketProvider

export interface CollaborationProviderOptions {
  room: string
  provider?: 'webrtc' | 'websocket'
  websocketUrl?: string
  signaling?: string[]
}

/**
 * The slice of y-websocket's provider the sync gate needs. Declared locally so
 * the gate does not depend on y-websocket's internal field shapes, and so tests
 * can drive it with a plain event emitter.
 */
export interface SyncableProvider {
  synced: boolean
  on: (event: string, callback: () => void) => void
  off: (event: string, callback: () => void) => void
}

export function createCollaborationProvider(
  doc: Y.Doc,
  options: CollaborationProviderOptions,
): CollaborationProvider | null {
  if (options.provider === 'webrtc') {
    return new WebrtcProvider(options.room, doc, {
      signaling: resolveSignalingUrls(options.signaling),
    })
  }
  if (options.provider === 'websocket') {
    if (!options.websocketUrl) {
      throw new Error('[Collaboration] websocketUrl is required when provider is "websocket"')
    }
    return new WebsocketProvider(options.websocketUrl, options.room, doc)
  }
  return null
}

/**
 * Issue #117 — resolves once the websocket provider completed its first sync.
 * The provider auto-connects on construction, so the first sync may already
 * have happened before the host awaits `whenReady`; check `synced`
 * synchronously and listen for both event names across y-websocket versions.
 *
 * The timeout is a floor, not a feature: it keeps the editor from hanging
 * forever on a wedged connection. The timer and the listeners are released on
 * settle so a resolved gate does not pin the event loop for the remaining
 * seconds (and does not keep firing on later reconnects).
 */
export function whenProviderSynced(
  provider: CollaborationProvider,
  timeoutMs: number = DEFAULT_SYNC_TIMEOUT_MS,
): Promise<void> {
  // webrtc syncs peer-to-peer and has no equivalent one-shot "first sync"
  // event, so there is nothing to gate on there.
  if (!(provider instanceof WebsocketProvider)) return Promise.resolve()
  return waitForProviderSync(provider as WebsocketProvider & SyncableProvider, timeoutMs)
}

/** @internal — the timer/listener handling behind `whenProviderSynced`. */
export function waitForProviderSync(
  provider: SyncableProvider,
  timeoutMs: number = DEFAULT_SYNC_TIMEOUT_MS,
): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const done = () => {
      if (settled) return
      settled = true
      if (timer !== undefined) clearTimeout(timer)
      provider.off('sync', done)
      provider.off('synced', done)
      resolve()
    }
    if (provider.synced) {
      done()
      return
    }
    // `on` + `off` rather than `once`: lib0's `once` registers a wrapper that
    // `off` cannot remove, which would leave a listener behind on timeout.
    provider.on('sync', done)
    provider.on('synced', done)
    if (timeoutMs > 0) timer = setTimeout(done, timeoutMs)
  })
}
