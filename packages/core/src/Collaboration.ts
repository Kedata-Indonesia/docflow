import type { AnyExtension } from '@tiptap/core'
import { Collaboration } from '@tiptap/extension-collaboration'
import { CollaborationCursor } from '@tiptap/extension-collaboration-cursor'
import { Awareness } from 'y-protocols/awareness'
import { WebrtcProvider } from 'y-webrtc'
import { WebsocketProvider } from 'y-websocket'
import * as Y from 'yjs'

export interface AwarenessState {
  clientId: number
  user: { name: string; color: string }
  cursor?: { from: number; to: number } | null
}

export interface CollaborationOptions {
  room: string
  provider?: 'webrtc' | 'websocket'
  websocketUrl?: string
  signaling?: string[]
  user: { name: string; color: string }
  onAwarenessChange?: (states: AwarenessState[]) => void
  initialStorageState?: Uint8Array
}

export interface CollaborationSetup {
  ydoc: Y.Doc
  provider: WebrtcProvider | WebsocketProvider | null
  awareness: Awareness
  destroy: () => void
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
}

function createAwarenessStates(awareness: Awareness): AwarenessState[] {
  const states: AwarenessState[] = []
  awareness.getStates().forEach((state: Record<string, unknown>, clientId: number) => {
    const raw = state as AwarenessRawState
    states.push({
      clientId,
      user: raw.user ?? { name: '', color: '' },
      cursor: raw.cursor ?? null,
    })
  })
  return states
}

export function createCollaboration(options: CollaborationOptions): CollaborationSetup {
  const ydoc = new Y.Doc()
  if (options.initialStorageState) {
    Y.applyUpdate(ydoc, options.initialStorageState)
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
    ydoc.destroy()
  }

  return { ydoc, provider, awareness, destroy }
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
