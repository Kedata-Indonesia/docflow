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
  user: { name: string; color: string }
  onAwarenessChange?: (states: AwarenessState[]) => void
}

export interface CollaborationSetup {
  ydoc: Y.Doc
  provider: WebrtcProvider | WebsocketProvider | null
  awareness: Awareness
  destroy: () => void
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
  let provider: WebrtcProvider | WebsocketProvider | null = null

  if (options.provider === 'webrtc') {
    provider = new WebrtcProvider(options.room, ydoc)
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
