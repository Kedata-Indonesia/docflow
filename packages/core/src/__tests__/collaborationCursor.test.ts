import { describe, it, expect, afterEach } from 'vitest'
import * as Y from 'yjs'
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness'
import type { WebsocketProvider } from 'y-websocket'
import { createEditor } from '../Editor.js'
import type { CollaborationSetup } from '../Collaboration.js'

/**
 * Two-client cursor test (#166).
 *
 * The cursor extension is docflow's own (`collaborationCursor`, built on
 * `@tiptap/y-tiptap`) because the published `@tiptap/extension-collaboration-cursor`
 * has no v3 build. Mounting is covered elsewhere; what this file pins is what a host
 * actually depends on — that a second client sees the first client's cursor, i.e. that
 * the awareness contract (`user` / `cursor` fields) survived the swap.
 *
 * Two Y.Docs are bridged the way a provider would, so each client keeps its own
 * `clientID` and the awareness filter treats them as distinct peers. In collaboration
 * mode TipTap ignores the `content` option (the document lives in the Y.Doc), so the
 * text is typed through the editor the way a user would.
 */

interface Client {
  instance: ReturnType<typeof createEditor>
  ydoc: Y.Doc
  awareness: Awareness
  target: HTMLDivElement
}

let clients: Client[] = []
let unbridge: (() => void) | null = null

/** Bridge two docs the way a provider does: apply the other side's updates. */
function bridge(a: Y.Doc, b: Y.Doc): () => void {
  const aToB = (update: Uint8Array, origin: unknown) => {
    if (origin === b) return
    Y.applyUpdate(b, update, a)
  }
  const bToA = (update: Uint8Array, origin: unknown) => {
    if (origin === a) return
    Y.applyUpdate(a, update, b)
  }
  a.on('update', aToB)
  b.on('update', bToA)
  return () => {
    a.off('update', aToB)
    b.off('update', bToA)
  }
}

function setupFor(ydoc: Y.Doc, awareness: Awareness): CollaborationSetup {
  const provider = {
    awareness,
    on: () => undefined,
    off: () => undefined,
    destroy: () => undefined,
  }
  return {
    ydoc,
    awareness,
    provider: provider as unknown as WebsocketProvider,
    whenReady: Promise.resolve(),
    destroy: () => undefined,
    setLocalCursorEnabled: () => undefined,
    purgeOfflineMirror: async () => undefined,
  }
}

function makeClient(ydoc: Y.Doc, user: { name: string; color: string }): Client {
  const target = document.createElement('div')
  document.body.appendChild(target)
  const awareness = new Awareness(ydoc)
  // `createCollaboration` publishes the local user on awareness; a setup built by hand
  // has to do it explicitly, exactly like a host would.
  awareness.setLocalStateField('user', user)
  const instance = createEditor({ target, collaboration: setupFor(ydoc, awareness) })
  const client: Client = { instance, ydoc, awareness, target }
  clients.push(client)
  return client
}

/** Forward one client's awareness state to the other, the way a provider does. */
function forwardAwareness(from: Awareness, to: Awareness): void {
  applyAwarenessUpdate(to, encodeAwarenessUpdate(from, [from.clientID]), 'test')
}

/** Poll until the predicate holds (mount + awareness effects settle across ticks). */
async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      if (predicate()) return true
    } catch {
      // The editor can be mid-mount; retry until the deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  return false
}

afterEach(() => {
  unbridge?.()
  unbridge = null
  while (clients.length > 0) {
    const client = clients.pop()!
    client.instance.destroy()
    client.target.remove()
    client.awareness.destroy()
    client.ydoc.destroy()
  }
  clients = []
})

describe('collaboration cursor (#166)', () => {
  it('renders the remote peer cursor from awareness state', async () => {
    const docA = new Y.Doc()
    const docB = new Y.Doc()
    unbridge = bridge(docA, docB)

    const alice = makeClient(docA, { name: 'Alice', color: '#ff0000' })
    const bob = makeClient(docB, { name: 'Bob', color: '#0000ff' })

    // Text typed on A reaches B through the bridge, the way a provider delivers it.
    alice.instance.editor.commands.insertContent('Hello world')
    const synced = await waitFor(() => bob.instance.editor.view.dom.textContent?.includes('Hello world') === true)
    expect(synced, 'B should receive the text A typed').toBe(true)

    // Alice puts the caret in the paragraph. The cursor plugin publishes the selection to
    // awareness as a relative position; a provider would forward it, so this test forwards
    // the awareness update by hand.
    // The cursor plugin only publishes while its view has focus, so A has to be focused
    // the way a user's tab would be before it advertises a caret.
    alice.instance.editor.view.dom.focus()
    alice.instance.editor.commands.focus()
    alice.instance.editor.commands.setTextSelection(3)
    const published = await waitFor(() => Boolean(alice.awareness.getLocalState()?.cursor))
    expect(published, 'A should publish its cursor to awareness').toBe(true)
    forwardAwareness(alice.awareness, bob.awareness)

    const gotCursor = await waitFor(() => bob.instance.editor.view.dom.querySelector('.ProseMirror-yjs-cursor') !== null)
    expect(gotCursor, 'B should render a cursor for A').toBe(true)

    const cursor = bob.instance.editor.view.dom.querySelector('.ProseMirror-yjs-cursor') as HTMLElement
    expect(cursor.getAttribute('style')).toContain('#ff0000')
    expect(cursor.textContent).toContain('Alice')
    // B must not paint a cursor for itself.
    expect(bob.instance.editor.view.dom.querySelectorAll('.ProseMirror-yjs-cursor')).toHaveLength(1)
  })

  it('drops the remote cursor once the peer leaves (awareness cleared)', async () => {
    const docA = new Y.Doc()
    const docB = new Y.Doc()
    unbridge = bridge(docA, docB)

    const alice = makeClient(docA, { name: 'Alice', color: '#ff0000' })
    const bob = makeClient(docB, { name: 'Bob', color: '#0000ff' })

    alice.instance.editor.commands.insertContent('Hello world')
    await waitFor(() => bob.instance.editor.view.dom.textContent?.includes('Hello world') === true)

    // The cursor plugin only publishes while its view has focus, so A has to be focused
    // the way a user's tab would be before it advertises a caret.
    alice.instance.editor.view.dom.focus()
    alice.instance.editor.commands.focus()
    alice.instance.editor.commands.setTextSelection(3)
    await waitFor(() => Boolean(alice.awareness.getLocalState()?.cursor))
    forwardAwareness(alice.awareness, bob.awareness)
    expect(await waitFor(() => bob.instance.editor.view.dom.querySelector('.ProseMirror-yjs-cursor') !== null)).toBe(true)

    // Peer goes away: `createCollaboration` clears the local state on destroy(), and a
    // provider would broadcast that removal.
    alice.awareness.setLocalState(null)
    forwardAwareness(alice.awareness, bob.awareness)

    const gone = await waitFor(() => bob.instance.editor.view.dom.querySelector('.ProseMirror-yjs-cursor') === null)
    expect(gone, 'the cursor should disappear when the peer leaves').toBe(true)
  })
})
