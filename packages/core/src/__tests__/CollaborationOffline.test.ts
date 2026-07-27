import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import * as Y from 'yjs'
import { createCollaboration } from '../Collaboration.js'

const user = { name: 'Alice', color: '#ff0000' }

/** Read the text inside the shared `default` XmlFragment. */
function fragmentText(doc: Y.Doc): string {
  const fragment = doc.getXmlFragment('default')
  return fragment.toArray().map((node) => node.toString()).join('')
}

function listDatabases(): Promise<Array<{ name?: string }>> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.databases()
    request.then(resolve, reject)
  })
}

describe('createCollaboration — offline mirror (Phase 9 OF1)', () => {
  it('round-trips content through IndexedDB across collaboration instances', async () => {
    const first = createCollaboration({ room: 'offline-rt', user, offline: true })
    expect(first.persistence).toBeDefined()

    const paragraph = new Y.XmlElement('paragraph')
    paragraph.insert(0, [new Y.XmlText('hello offline')])
    first.ydoc.getXmlFragment('default').insert(0, [paragraph])

    await first.persistence!.whenSynced
    // Flush the local update into IndexedDB before tearing down.
    await new Promise((resolve) => setTimeout(resolve, 20))
    first.destroy()

    const second = createCollaboration({ room: 'offline-rt', user, offline: true })
    await second.persistence!.whenSynced

    expect(fragmentText(second.ydoc)).toContain('hello offline')

    second.destroy()
  })

  it('merges an offline edit with a divergent remote update without content loss', async () => {
    // Shared baseline: both sides start from the same server state.
    const server = new Y.Doc()
    server.getXmlFragment('default').insert(0, [(() => {
      const p = new Y.XmlElement('paragraph')
      p.insert(0, [new Y.XmlText('baseline')])
      return p
    })()])
    const baseline = Y.encodeStateAsUpdate(server)

    const local = createCollaboration({
      room: 'offline-merge',
      user,
      offline: true,
      initialStorageState: baseline,
    })
    const remote = new Y.Doc()
    Y.applyUpdate(remote, baseline)

    // Both sides edit divergently while "offline".
    local.ydoc.getXmlFragment('default').insert(1, [(() => {
      const p = new Y.XmlElement('paragraph')
      p.insert(0, [new Y.XmlText('local edit')])
      return p
    })()])
    remote.getXmlFragment('default').insert(1, [(() => {
      const p = new Y.XmlElement('paragraph')
      p.insert(0, [new Y.XmlText('remote edit')])
      return p
    })()])

    // Reconnect: exchange updates both directions (plain Yjs merge).
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(local.ydoc))
    Y.applyUpdate(local.ydoc, Y.encodeStateAsUpdate(remote))

    const localText = fragmentText(local.ydoc)
    const remoteText = fragmentText(remote)
    expect(localText).toBe(remoteText)
    expect(localText).toContain('baseline')
    expect(localText).toContain('local edit')
    expect(localText).toContain('remote edit')

    local.destroy()
    remote.destroy()
    server.destroy()
  })

  it('does not touch IndexedDB when `offline` is absent', async () => {
    const before = (await listDatabases()).filter((db) => db.name?.startsWith('docflow-'))

    const collab = createCollaboration({ room: 'offline-absent', user })
    expect(collab.persistence).toBeUndefined()
    collab.ydoc.getXmlFragment('default').insert(0, [new Y.XmlElement('paragraph')])
    collab.destroy()

    const after = (await listDatabases()).filter((db) => db.name?.startsWith('docflow-'))
    expect(after.length).toBe(before.length)
    expect(after.some((db) => db.name === 'docflow-offline-absent')).toBe(false)
  })
})
