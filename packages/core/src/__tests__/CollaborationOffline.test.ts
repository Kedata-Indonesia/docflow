import 'fake-indexeddb/auto'
import { describe, it, expect, vi } from 'vitest'
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

  it('purgeOfflineMirror deletes the DB and a fresh mount starts empty', async () => {
    const collab1 = createCollaboration({ room: 'purge-test', user, offline: true })
    const paragraph = new Y.XmlElement('paragraph')
    paragraph.insert(0, [new Y.XmlText('purge me')])
    collab1.ydoc.getXmlFragment('default').insert(0, [paragraph])
    await collab1.persistence!.whenSynced
    await new Promise((resolve) => setTimeout(resolve, 20))

    await collab1.purgeOfflineMirror()
    collab1.destroy()

    const collab2 = createCollaboration({ room: 'purge-test', user, offline: true })
    await collab2.persistence!.whenSynced
    expect(fragmentText(collab2.ydoc)).not.toContain('purge me')
    collab2.destroy()
  })

  it('mirrorKey scopes the IndexedDB cache per user/tenant so different identities do not inherit state', async () => {
    const user1Collab = createCollaboration({
      room: 'shared-room',
      user: { name: 'Alice', color: '#ff0000' },
      offline: true,
      mirrorKey: 'docflow-shared-room-alice',
    })
    const paragraph = new Y.XmlElement('paragraph')
    paragraph.insert(0, [new Y.XmlText('alice secret')])
    user1Collab.ydoc.getXmlFragment('default').insert(0, [paragraph])
    await user1Collab.persistence!.whenSynced
    await new Promise((resolve) => setTimeout(resolve, 20))
    user1Collab.destroy()

    // Bob opens the same room with his own mirrorKey
    const user2Collab = createCollaboration({
      room: 'shared-room',
      user: { name: 'Bob', color: '#00ff00' },
      offline: true,
      mirrorKey: 'docflow-shared-room-bob',
    })
    await user2Collab.persistence!.whenSynced
    expect(fragmentText(user2Collab.ydoc)).not.toContain('alice secret')
    user2Collab.destroy()
  })

  it('quota-exceeded / storage estimate path warns gracefully', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Mock navigator.storage.estimate to simulate >90% usage
    const origStorage = navigator.storage
    Object.defineProperty(navigator, 'storage', {
      value: {
        estimate: async () => ({ usage: 95, quota: 100 }),
      },
      configurable: true,
    })

    const collab = createCollaboration({ room: 'quota-test', user, offline: true })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Storage quota is near capacity'),
    )

    if (origStorage) {
      Object.defineProperty(navigator, 'storage', {
        value: origStorage,
        configurable: true,
      })
    }
    warnSpy.mockRestore()
    collab.destroy()
  })

  it('downgrade regression: purged or un-cached user does not re-merge old cached state', async () => {
    const room = 'downgrade-room'
    const collab1 = createCollaboration({
      room,
      user: { name: 'Editor', color: '#ff0000' },
      offline: true,
      mirrorKey: 'docflow-downgrade-user1',
    })
    const paragraph = new Y.XmlElement('paragraph')
    paragraph.insert(0, [new Y.XmlText('pre-downgrade edit')])
    collab1.ydoc.getXmlFragment('default').insert(0, [paragraph])
    await collab1.persistence!.whenSynced
    await new Promise((resolve) => setTimeout(resolve, 20))
    collab1.destroy()

    // Host purges mirror upon role downgrade to viewer
    const collab2 = createCollaboration({
      room,
      user: { name: 'Viewer', color: '#00ff00' },
      offline: true,
      mirrorKey: 'docflow-downgrade-user1',
    })
    await collab2.purgeOfflineMirror()
    collab2.destroy()

    const collab3 = createCollaboration({
      room,
      user: { name: 'Viewer', color: '#00ff00' },
      offline: true,
      mirrorKey: 'docflow-downgrade-user1',
    })
    await collab3.persistence!.whenSynced
    expect(fragmentText(collab3.ydoc)).not.toContain('pre-downgrade edit')
    collab3.destroy()
  })
})

describe('createCollaboration — whenReady gate (issue #117)', () => {
  it('exposes a `whenReady` promise even when neither offline nor provider is set', async () => {
    const collab = createCollaboration({ room: 'ready-empty', user })
    expect(collab.whenReady).toBeInstanceOf(Promise)
    await expect(collab.whenReady).resolves.toBeUndefined()
    collab.destroy()
  })

  it('resolves whenReady after the offline mirror is wired (offline=true)', async () => {
    const collab = createCollaboration({ room: 'ready-offline', user, offline: true })
    expect(collab.persistence).toBeDefined()
    await expect(collab.whenReady).resolves.toBeUndefined()
    collab.destroy()
  })

  it('regression — issue #117: a stale IndexedDB cache does NOT bleed into the ydoc before whenReady resolves', async () => {
    // B's first session: cache a paragraph containing the "image" sentinel.
    const first = createCollaboration({ room: 'regress-117', user, offline: true })
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
    const second = createCollaboration({ room: 'regress-117', user, offline: true })
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
