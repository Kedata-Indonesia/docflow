import type { Awareness } from 'y-protocols/awareness'
import { Awareness as AwarenessClass } from 'y-protocols/awareness'
import { WebsocketProvider } from 'y-websocket'
import * as Y from 'yjs'

export interface SubdocState {
  id: string
  doc: Y.Doc
  provider: WebsocketProvider | null
  active: boolean
}

export interface SubdocumentProviderOptions {
  /** WebSocket URL for the collaboration server. */
  websocketUrl: string
  /** Room prefix — subdocuments use `${roomPrefix}/${id}` as room name. */
  roomPrefix: string
  /** User info for awareness. */
  user: { name: string; color: string }
  /** Number of subdocuments to keep active (buffer around visible viewport). */
  maxActive?: number
  /** Called when subdocument state changes (active/deactivated). */
  onStateChange?: (states: SubdocState[]) => void
}

/**
 * Manages multiple Y.Doc subdocuments under a parent document.
 *
 * Use case: large documents (100+ pages) split into per-section subdocuments.
 * Only active (visible) subdocuments are connected to the network via
 * WebSocketProvider; inactive ones keep local state but stop syncing.
 *
 * Usage:
 *   const provider = new SubdocumentProvider({ websocketUrl, roomPrefix, user })
 *   provider.createSubdoc('section-1')
 *   provider.activate('section-1')     // starts syncing
 *   provider.deactivate('section-1')   // stops syncing
 *   const frag = provider.getFragment('section-1') // Y.XmlFragment for editor
 */
export class SubdocumentProvider {
  readonly parentDoc: Y.Doc
  readonly subdocs: Y.Map<Y.Doc>
  readonly awareness: Awareness

  private readonly options: Required<SubdocumentProviderOptions>
  private readonly states = new Map<string, SubdocState>()
  private readonly activeQueue: string[] = []
  private readonly parentProvider: WebsocketProvider | null = null

  constructor(options: SubdocumentProviderOptions) {
    this.options = {
      maxActive: options.maxActive ?? 5,
      onStateChange: options.onStateChange ?? (() => {}),
      ...options,
    }

    this.parentDoc = new Y.Doc()
    this.subdocs = this.parentDoc.getMap<Y.Doc>('subdocs')
    this.awareness = new AwarenessClass(this.parentDoc)
    this.awareness.setLocalStateField('user', this.options.user)

    // Parent provider syncs the subdoc map (which subdocs exist).
    // Subdocs themselves have their own providers.
    this.parentProvider = new WebsocketProvider(
      this.options.websocketUrl,
      `${this.options.roomPrefix}/_parent`,
      this.parentDoc,
    )
  }

  /** Create a new subdocument. Does NOT activate it. */
  createSubdoc(id: string, initialState?: Uint8Array): Y.Doc {
    if (this.states.has(id)) return this.states.get(id)!.doc

    const doc = new Y.Doc()
    if (initialState) Y.applyUpdate(doc, initialState)
    doc.getXmlFragment('default')

    this.subdocs.set(id, doc)

    this.states.set(id, {
      id,
      doc,
      provider: null,
      active: false,
    })

    this.options.onStateChange(this.getAllStates())
    return doc
  }

  /** Activate a subdocument — connects it to the network for live sync. */
  activate(id: string): void {
    const state = this.states.get(id)
    if (!state || state.active) return

    // Enforce max active limit: deactivate oldest if needed.
    if (this.activeQueue.length >= this.options.maxActive) {
      const oldest = this.activeQueue.shift()
      if (oldest) this.deactivate(oldest)
    }

    const doc = state.doc
    const roomName = `${this.options.roomPrefix}/${id}`
    const provider = new WebsocketProvider(
      this.options.websocketUrl,
      roomName,
      doc,
    )

    // Copy awareness to subdoc provider.
    provider.awareness.setLocalStateField('user', this.options.user)

    state.provider = provider
    state.active = true
    this.activeQueue.push(id)

    this.options.onStateChange(this.getAllStates())
  }

  /** Deactivate a subdocument — disconnects it from the network. */
  deactivate(id: string): void {
    const state = this.states.get(id)
    if (!state || !state.active) return

    state.provider?.destroy()
    state.provider = null
    state.active = false

    const idx = this.activeQueue.indexOf(id)
    if (idx >= 0) this.activeQueue.splice(idx, 1)

    this.options.onStateChange(this.getAllStates())
  }

  /** Get the Y.XmlFragment for a subdocument. */
  getFragment(id: string): Y.XmlFragment | null {
    const doc = this.states.get(id)?.doc ?? this.subdocs.get(id)
    if (!doc) return null
    return doc.getXmlFragment('default')
  }

  /** Check if a subdocument is currently active (syncing). */
  isActive(id: string): boolean {
    return this.states.get(id)?.active ?? false
  }

  /** Get all subdocument states. */
  getAllStates(): SubdocState[] {
    return Array.from(this.states.values())
  }

  /** Get IDs of all active subdocuments. */
  getActiveIds(): string[] {
    return [...this.activeQueue]
  }

  /** Destroy all subdocuments and providers. */
  destroy(): void {
    for (const [id] of this.states) {
      this.deactivate(id)
    }
    this.parentProvider?.destroy()
    this.parentDoc.destroy()
    this.states.clear()
    this.activeQueue.length = 0
  }
}
