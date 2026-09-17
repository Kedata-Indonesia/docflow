import { describe, it, expect, vi } from 'vitest'
import * as Y from 'yjs'
import {
  createCollaboration,
  collaborationExtensions,
  isLocalCursorEnabled,
} from '../Collaboration.js'
import { createEditor } from '../Editor.js'

describe('createCollaboration', () => {
  it('creates a Y.Doc, awareness, and a null provider by default', async () => {
    const collab = await createCollaboration({
      room: 'room-1',
      user: { name: 'Alice', color: '#ff0000' },
    })

    expect(collab.ydoc).toBeInstanceOf(Y.Doc)
    expect(collab.provider).toBeNull()
    expect(collab.awareness).toBeDefined()

    collab.destroy()
  })

  it('sets the local awareness user', async () => {
    const user = { name: 'Alice', color: '#ff0000' }
    const collab = await createCollaboration({ room: 'room-1', user })

    expect(collab.awareness.getLocalState()).toMatchObject({ user })

    collab.destroy()
  })

  it('removes the local awareness state on destroy', async () => {
    const collab = await createCollaboration({
      room: 'room-1',
      user: { name: 'Alice', color: '#ff0000' },
    })

    expect(collab.awareness.getLocalState()).not.toBeNull()
    collab.destroy()
    expect(collab.awareness.getLocalState()).toBeNull()
  })

  it('calls onAwarenessChange with the current states and on changes', async () => {
    const onAwarenessChange = vi.fn()
    const collab = await createCollaboration({
      room: 'room-1',
      user: { name: 'Alice', color: '#ff0000' },
      onAwarenessChange,
    })

    expect(onAwarenessChange).toHaveBeenCalled()
    expect(
      onAwarenessChange.mock.calls[0][0].some(
        (state: { user: { name: string } }) => state.user.name === 'Alice',
      ),
    ).toBe(true)

    collab.awareness.setLocalStateField('cursor', { from: 1, to: 5 })
    expect(onAwarenessChange).toHaveBeenCalledTimes(2)

    collab.destroy()
  })

  it('converges two Yjs documents in the same room via in-memory sync', async () => {
    const a = await createCollaboration({
      room: 'shared-room',
      user: { name: 'Alice', color: '#ff0000' },
    })
    const b = await createCollaboration({
      room: 'shared-room',
      user: { name: 'Bob', color: '#0000ff' },
    })

    a.ydoc.getText('content').insert(0, 'hello')
    Y.applyUpdate(b.ydoc, Y.encodeStateAsUpdate(a.ydoc))

    expect(b.ydoc.getText('content').toString()).toBe('hello')

    a.destroy()
    b.destroy()
  })

  it('keeps documents from different rooms isolated', async () => {
    const a = await createCollaboration({
      room: 'room-a',
      user: { name: 'Alice', color: '#ff0000' },
    })
    const b = await createCollaboration({
      room: 'room-b',
      user: { name: 'Bob', color: '#0000ff' },
    })

    a.ydoc.getText('content').insert(0, 'a-only')

    expect(b.ydoc.getText('content').toString()).toBe('')
    expect(a.ydoc).not.toBe(b.ydoc)

    a.destroy()
    b.destroy()
  })
})

describe('collaborationExtensions', () => {
  it('returns Collaboration (and CollaborationCursor when a provider exists)', async () => {
    const setup = await createCollaboration({
      room: 'ext-room',
      user: { name: 'Alice', color: '#ff0000' },
    })

    const extensions = collaborationExtensions(setup)
    const names = extensions.map((extension) => extension.name)

    expect(names).toContain('collaboration')
    expect(names).not.toContain('collaborationCursor')

    setup.destroy()
  })
})

describe('createEditor collaboration integration', () => {
  it('wires collaboration extensions automatically', async () => {
    const target = document.createElement('div')
    // Raw CollaborationOptions are no longer accepted by createEditor (the
    // barrel must stay free of eager provider imports — issue fe-aktifai#230).
    // Hosts build the setup via the async createCollaboration and pass it.
    const collabSetup = await createCollaboration({
      room: 'editor-room',
      user: { name: 'Alice', color: '#ff0000' },
    })
    const editor = createEditor({
      target,
      collaboration: collabSetup,
    })

    const names = editor.editor.extensionManager.extensions.map((e) => e.name)
    expect(names).toContain('collaboration')

    editor.destroy()
    // The setup is host-owned: the editor must not release the room.
    collabSetup.destroy()
  })

  it('does not destroy the host-owned collaboration setup on editor.destroy()', async () => {
    // Regression: hosts remount the editor against the same room (Vue `:key`
    // bumps, tab switches, external document refreshes). `editor.destroy()`
    // used to call `setup.destroy()`, which silently killed the provider +
    // awareness on every remount — sync and remote cursors only came back
    // after a full page reload.
    const target = document.createElement('div')
    const collabSetup = await createCollaboration({
      room: 'editor-ownership-room',
      user: { name: 'Alice', color: '#ff0000' },
    })
    const editor = createEditor({ target, collaboration: collabSetup })

    editor.destroy()

    // Awareness, provider and Y.Doc stay alive — the host owns them.
    expect(collabSetup.awareness.getLocalState()).not.toBeNull()
    expect(collabSetup.awareness.getLocalState()?.present).toBe(true)
    expect(collabSetup.ydoc.isDestroyed).toBe(false)

    // A second editor can rebind to the very same live setup.
    const reboundTarget = document.createElement('div')
    const rebound = createEditor({ target: reboundTarget, collaboration: collabSetup })
    expect(
      rebound.editor.extensionManager.extensions.map((e) => e.name),
    ).toContain('collaboration')
    rebound.destroy()

    // Only the host's explicit destroy() releases the room.
    collabSetup.destroy()
    expect(collabSetup.awareness.getLocalState()).toBeNull()
    expect(collabSetup.ydoc.isDestroyed).toBe(true)
  })
})

// ─── Phase 9 PR1 + PR2 — awareness state shape + present gate ───────────────

describe('awareness state — present flag + cursor gate (Phase 9 PR1+PR2)', () => {
  it('defaults `present` to true on the local state', async () => {
    const collab = await createCollaboration({
      room: 'pr-room',
      user: { name: 'Alice', color: '#ff0000' },
    })
    expect(collab.awareness.getLocalState()?.present).toBe(true)
    collab.destroy()
  })

  it('reports present=true for the local user by default', async () => {
    const onAwarenessChange = vi.fn()
    const a = await createCollaboration({
      room: 'pr-room',
      user: { name: 'Alice', color: '#ff0000' },
      onAwarenessChange,
    })
    const lastCall = onAwarenessChange.mock.calls.at(-1)?.[0] as
      | Array<{ user: { name: string }; present: boolean }>
      | undefined
    expect(lastCall).toBeDefined()
    const alice = lastCall!.find((s) => s.user.name === 'Alice')
    expect(alice?.present).toBe(true)
    a.destroy()
  })

  it('toggles `emitCursor` to false (and clears cursor) when setLocalCursorEnabled(false) fires — but `present` stays true', async () => {
    // 2026-08 fix: `setLocalCursorEnabled(false)` is the cursor-publish
    // perf gate (fires on `visibilitychange` when the user switches tabs).
    // It must NOT flip `present` to false — that caused the "collaborator
    // avatar flashes off" regression in the two-writer scenario. Only
    // `destroy()` clears `present` (via `awareness.setLocalState(null)`).
    const onAwarenessChange = vi.fn()
    const a = await createCollaboration({
      room: 'pr-room',
      user: { name: 'Alice', color: '#ff0000' },
      onAwarenessChange,
    })
    a.setLocalCursorEnabled(false)
    // present stays true — the user is still in the editor.
    expect(a.awareness.getLocalState()?.present).toBe(true)
    // emitCursor gate flipped, cursor cleared.
    expect(a.awareness.getLocalState()?.emitCursor).toBe(false)
    expect(a.awareness.getLocalState()?.cursor).toBeNull()
    // onAwarenessChange fires on the toggle (one round-trip signal).
    expect(onAwarenessChange).toHaveBeenCalled()
    a.destroy()
  })

  it('clears the cursor field when leaving the editor (present stays true)', async () => {
    // 2026-08 fix: `setLocalCursorEnabled(false)` must NOT flip `present` to
    // false. The visibilitychange handler in apps/web calls this whenever
    // the user switches browser tabs (a cursor-publish perf gate), and the
    // previous coupling caused the peer's top-bar avatar to flash off on
    // every tab switch. `present` only goes false on `destroy()` (the
    // editor-unmount → WS-close → server-side awareness cleanup path).
    const a = await createCollaboration({
      room: 'pr-room',
      user: { name: 'Alice', color: '#ff0000' },
    })
    a.awareness.setLocalStateField('cursor', { from: 1, to: 5 })
    expect(a.awareness.getLocalState()?.cursor).toEqual({ from: 1, to: 5 })
    a.setLocalCursorEnabled(false)
    expect(a.awareness.getLocalState()?.cursor).toBeNull()
    // present stays true — only destroy() clears it.
    expect(a.awareness.getLocalState()?.present).toBe(true)
    a.destroy()
  })

  it('peers see Alice leave on destroy (no REST lag)', async () => {
    // Cross-peer propagation requires a real WebrtcProvider /
    // WebsocketProvider (the awareness `change` events are routed through
    // the provider's sync protocol). With no provider, the local
    // awareness change is the only signal — Bob's `onAwarenessChange`
    // would only fire if Alice's state propagated through a network
    // transport. The live E2E (`e2e/product/collaboration.spec.ts`)
    // covers the cross-peer case via the websocket provider; this unit
    // test pins the *local* mutation contract.
    const onBobAwareness = vi.fn()
    const alice = await createCollaboration({
      room: 'pr-room',
      user: { name: 'Alice', color: '#ff0000' },
    })
    const bob = await createCollaboration({
      room: 'pr-room',
      user: { name: 'Bob', color: '#0000ff' },
      onAwarenessChange: onBobAwareness,
    })

    // Alice toggles cursor emission off (perf gate, e.g. tab hidden).
    alice.setLocalCursorEnabled(false)

    // Local mutation: present stayed true (only cursor cleared).
    expect(alice.awareness.getLocalState()?.present).toBe(true)
    expect(alice.awareness.getLocalState()?.cursor).toBeNull()
    // Bob hasn't seen Alice yet (no provider in unit test) — his
    // awareness state is still self-only.
    const bobSeesAlice = onBobAwareness.mock.calls
      .at(-1)?.[0]
      ?.some((s: { user: { name: string } }) => s.user.name === 'Alice')
    expect(bobSeesAlice).toBe(false)

    alice.destroy()
    bob.destroy()
  })

  it('isLocalCursorEnabled reflects the current gate state', async () => {
    const a = await createCollaboration({
      room: 'pr-room',
      user: { name: 'Alice', color: '#ff0000' },
    })
    expect(isLocalCursorEnabled(a)).toBe(true)
    a.setLocalCursorEnabled(false)
    expect(isLocalCursorEnabled(a)).toBe(false)
    a.setLocalCursorEnabled(true)
    expect(isLocalCursorEnabled(a)).toBe(true)
    a.destroy()
  })

  it('does not duplicate awareness-change events when toggling to the same value', async () => {
    const onAwarenessChange = vi.fn()
    const a = await createCollaboration({
      room: 'pr-room',
      user: { name: 'Alice', color: '#ff0000' },
      onAwarenessChange,
    })
    const callsAfterCreate = onAwarenessChange.mock.calls.length
    a.setLocalCursorEnabled(true) // already true — no-op
    expect(onAwarenessChange.mock.calls.length).toBe(callsAfterCreate)
    a.destroy()
  })

  it('emits cursor=true by default so CollaborationCursor renders for the local user', async () => {
    // Backwards compat: legacy states that only carry `user` + `cursor`
    // should appear as `present: true` to peers. The createAwarenessStates
    // mapping handles missing `present` by defaulting to true.
    const a = await createCollaboration({
      room: 'pr-room',
      user: { name: 'Alice', color: '#ff0000' },
    })
    // Force a legacy shape (no `present`) by manually clearing it.
    a.awareness.setLocalStateField('present', undefined as unknown as boolean)
    expect(a.awareness.getLocalState()?.present).toBeUndefined()
    // isLocalCursorEnabled reads the dedicated `emitCursor` field (not
    // `present`) → undefined !== false → true (legacy safe).
    expect(isLocalCursorEnabled(a)).toBe(true)
    a.destroy()
  })
})
