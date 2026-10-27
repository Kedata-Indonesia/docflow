import { WebrtcProvider } from 'y-webrtc'
import { WebsocketProvider } from 'y-websocket'
import type * as Y from 'yjs'

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

export type CollaborationProvider = WebrtcProvider | WebsocketProvider

export interface CollaborationProviderOptions {
  room: string
  provider?: 'webrtc' | 'websocket'
  websocketUrl?: string
  signaling?: string[]
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
 * A hard timeout keeps the editor from hanging forever on a wedged connection.
 */
export function whenProviderSynced(provider: CollaborationProvider): Promise<void> {
  if (!(provider instanceof WebsocketProvider)) return Promise.resolve()
  const ws = provider as WebsocketProvider & {
    once: (event: string, cb: (state: boolean) => void) => void
    synced: boolean
  }
  return new Promise<void>((resolve) => {
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      resolve()
    }
    if (ws.synced) {
      done()
      return
    }
    ws.once('sync', done)
    ws.once('synced', done)
    setTimeout(done, 5000)
  })
}
