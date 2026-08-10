import { describe, it, expect } from 'vitest'
import { SubdocumentProvider } from '../SubdocumentProvider.js'
import * as Y from 'yjs'

describe('SubdocumentProvider', () => {
  it('creates subdocuments as Y.Doc instances', () => {
    const provider = new SubdocumentProvider({
      websocketUrl: 'ws://localhost:1234',
      roomPrefix: 'test-room',
      user: { name: 'Tester', color: '#ff0000' },
    })

    const doc = provider.createSubdoc('section-1')
    expect(doc).toBeInstanceOf(Y.Doc)
    expect(doc.getXmlFragment('default')).toBeDefined()

    const frag = provider.getFragment('section-1')
    expect(frag).toBeDefined()

    expect(provider.getAllStates()).toHaveLength(1)
    expect(provider.getAllStates()[0].id).toBe('section-1')
    expect(provider.getAllStates()[0].active).toBe(false)

    provider.destroy()
  })

  it('activates and deactivates subdocuments', () => {
    const stateLog: string[] = []
    const provider = new SubdocumentProvider({
      websocketUrl: 'ws://localhost:1235',
      roomPrefix: 'test-room',
      user: { name: 'Tester', color: '#ff0000' },
      maxActive: 2,
      onStateChange: (states) => {
        stateLog.push(states.filter(s => s.active).map(s => s.id).join(','))
      },
    })

    provider.createSubdoc('a')
    provider.createSubdoc('b')
    provider.createSubdoc('c')

    expect(provider.isActive('a')).toBe(false)

    provider.activate('a')
    expect(provider.isActive('a')).toBe(true)
    expect(provider.getActiveIds()).toEqual(['a'])

    provider.activate('b')
    expect(provider.getActiveIds()).toEqual(['a', 'b'])

    // Activating 'c' should push out oldest ('a') due to maxActive=2.
    provider.activate('c')
    expect(provider.isActive('a')).toBe(false)
    expect(provider.isActive('b')).toBe(true)
    expect(provider.isActive('c')).toBe(true)
    expect(provider.getActiveIds()).toEqual(['b', 'c'])

    provider.deactivate('b')
    expect(provider.isActive('b')).toBe(false)
    expect(provider.getActiveIds()).toEqual(['c'])

    provider.destroy()
  })

  it('stores subdocs in parent Y.Map', () => {
    const provider = new SubdocumentProvider({
      websocketUrl: 'ws://localhost:1236',
      roomPrefix: 'test-room',
      user: { name: 'Tester', color: '#ff0000' },
    })

    const doc = provider.createSubdoc('page-42')
    const fragment = doc.getXmlFragment('default')
    fragment.insert(0, [new Y.XmlText('hello from page 42')])

    const retrieved = provider.subdocs.get('page-42')
    expect(retrieved).toBeDefined()
    expect(retrieved!.getXmlFragment('default').toString()).toBe('hello from page 42')

    provider.destroy()
  })

  it('preserves initial state on create', () => {
    const provider = new SubdocumentProvider({
      websocketUrl: 'ws://localhost:1237',
      roomPrefix: 'test-room',
      user: { name: 'Tester', color: '#ff0000' },
    })

    // Create a doc with some state, encode it, pass as initial state.
    const tempDoc = new Y.Doc()
    tempDoc.getXmlFragment('default').insert(0, [new Y.XmlText('pre-seeded')])
    const initialState = Y.encodeStateAsUpdate(tempDoc)

    const doc = provider.createSubdoc('seeded', initialState)
    expect(doc.getXmlFragment('default').toString()).toBe('pre-seeded')

    provider.destroy()
  })
})
