import { describe, it, expect, vi } from 'vitest'
import * as Y from 'yjs'
import { createCollaboration, collaborationExtensions } from '../Collaboration.js'
import { createEditor } from '../Editor.js'

describe('createCollaboration', () => {
  it('creates a Y.Doc, awareness, and a null provider by default', () => {
    const collab = createCollaboration({
      room: 'room-1',
      user: { name: 'Alice', color: '#ff0000' },
    })

    expect(collab.ydoc).toBeInstanceOf(Y.Doc)
    expect(collab.provider).toBeNull()
    expect(collab.awareness).toBeDefined()

    collab.destroy()
  })

  it('sets the local awareness user', () => {
    const user = { name: 'Alice', color: '#ff0000' }
    const collab = createCollaboration({ room: 'room-1', user })

    expect(collab.awareness.getLocalState()).toMatchObject({ user })

    collab.destroy()
  })

  it('removes the local awareness state on destroy', () => {
    const collab = createCollaboration({
      room: 'room-1',
      user: { name: 'Alice', color: '#ff0000' },
    })

    expect(collab.awareness.getLocalState()).not.toBeNull()
    collab.destroy()
    expect(collab.awareness.getLocalState()).toBeNull()
  })

  it('calls onAwarenessChange with the current states and on changes', () => {
    const onAwarenessChange = vi.fn()
    const collab = createCollaboration({
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

  it('converges two Yjs documents in the same room via in-memory sync', () => {
    const a = createCollaboration({
      room: 'shared-room',
      user: { name: 'Alice', color: '#ff0000' },
    })
    const b = createCollaboration({
      room: 'shared-room',
      user: { name: 'Bob', color: '#0000ff' },
    })

    a.ydoc.getText('content').insert(0, 'hello')
    Y.applyUpdate(b.ydoc, Y.encodeStateAsUpdate(a.ydoc))

    expect(b.ydoc.getText('content').toString()).toBe('hello')

    a.destroy()
    b.destroy()
  })

  it('keeps documents from different rooms isolated', () => {
    const a = createCollaboration({
      room: 'room-a',
      user: { name: 'Alice', color: '#ff0000' },
    })
    const b = createCollaboration({
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
  it('returns Collaboration (and CollaborationCursor when a provider exists)', () => {
    const setup = createCollaboration({
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
  it('wires collaboration extensions automatically', () => {
    const target = document.createElement('div')
    const editor = createEditor({
      target,
      collaboration: { room: 'editor-room', user: { name: 'Alice', color: '#ff0000' } },
    })

    const names = editor.editor.extensionManager.extensions.map((e) => e.name)
    expect(names).toContain('collaboration')

    editor.destroy()
  })
})
