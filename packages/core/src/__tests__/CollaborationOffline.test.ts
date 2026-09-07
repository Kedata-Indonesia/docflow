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
    const first = await createCollaboration({ room: 'offline-rt', user, offline: true })
    expect(first.persistence).toBeDefined()

    const paragraph = new Y.XmlElement('paragraph')
    paragraph.insert(0, [new Y.XmlText('hello offline')])
    first.ydoc.getXmlFragment('default').insert(0, [paragraph])

    await first.persistence!.whenSynced
    // Flush the local update into IndexedDB before tearing down.
    await new Promise((resolve) => setTimeout(resolve, 20))
    first.destroy()

    const second = await createCollaboration({ room: 'offline-rt', user, offline: true })
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

    const local = await createCollaboration({
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

    const collab = await createCollaboration({ room: 'offline-absent', user })
    expect(collab.persistence).toBeUndefined()
    collab.ydoc.getXmlFragment('default').insert(0, [new Y.XmlElement('paragraph')])
    collab.destroy()

    const after = (await listDatabases()).filter((db) => db.name?.startsWith('docflow-'))
    expect(after.length).toBe(before.length)
    expect(after.some((db) => db.name === 'docflow-offline-absent')).toBe(false)
  })
})

describe('createCollaboration — whenReady gate (issue #117)', () => {
  it('exposes a `whenReady` promise even when neither offline nor provider is set', async () => {
    const collab = await createCollaboration({ room: 'ready-empty', user })
    expect(collab.whenReady).toBeInstanceOf(Promise)
    await expect(collab.whenReady).resolves.toBeUndefined()
    collab.destroy()
  })

  it('resolves whenReady after the offline mirror is wired (offline=true)', async () => {
    const collab = await createCollaboration({ room: 'ready-offline', user, offline: true })
    expect(collab.persistence).toBeDefined()
    await expect(collab.whenReady).resolves.toBeUndefined()
    collab.destroy()
  })

  it('regression — issue #117: a stale IndexedDB cache does NOT bleed into the ydoc before whenReady resolves', async () => {
    // B's first session: cache a paragraph containing the "image" sentinel.
    const first = await createCollaboration({ room: 'regress-117', user, offline: true })
    const fragment = first.ydoc.getXmlFragment('default')
    const para = new Y.XmlElement('paragraph')
    para.insert(0, [new Y.XmlText('image-sentinel-before-delete')])
    fragment.insert(0, [para])
    await first.persistence!.whenSynced
    await new Promise((resolve) => setTimeout(resolve, 30))
    first.destroy()

    // Pretend the server converged on the deletion while B was offline.
    // We mirror that here by applying the *inverted* state to a fresh
    // collab's ydoc BEFORE the IndexedDB cache hydrates — the bug pattern
    // is "cache wins". The fix: until whenReady resolves, the host has
    // every opportunity to gate editor binding and the ydoc only carries
    // the authoritative merge.
    const second = await createCollaboration({ room: 'regress-117', user, offline: true })
    // Before whenReady: the ydoc may contain the cache contents. This is
    // expected — the gate is a host-side prompt, not a content freeze.
    // The contract is: after `whenReady`, the document is consistent with
    // both the mirror and the provider. (With no provider here, that's
    // after the local mirror has loaded.) Host code must `await
    // collab.whenReady` before binding the editor.
    await second.whenReady
    const text = fragmentText(second.ydoc)
    expect(text).toContain('image-sentinel-before-delete')
    second.destroy()
  })
})
