import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { createCollaboration } from '../Collaboration.js'
import {
  purgeOfflineMirror,
  resolveMirrorKey,
  type OfflineMirrorWarning,
} from '../offlineMirror.js'

const user = { name: 'Alice', color: '#ff0000' }

function fragmentText(doc: Y.Doc): string {
  const fragment = doc.getXmlFragment('default')
  return fragment.toArray().map((node) => node.toString()).join('')
}

function appendParagraph(doc: Y.Doc, text: string): void {
  const paragraph = new Y.XmlElement('paragraph')
  paragraph.insert(0, [new Y.XmlText(text)])
  doc.getXmlFragment('default').insert(0, [paragraph])
}

function pause(ms = 20): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitFor(predicate: () => boolean, timeoutMs = 500): Promise<void> {
  const started = Date.now()
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('waitFor timed out')
    await pause(5)
  }
}

function listDatabases(): Promise<string[]> {
  return indexedDB.databases().then((databases) =>
    databases.map((database) => database.name ?? ''),
  )
}

async function databaseExists(name: string): Promise<boolean> {
  return (await listDatabases()).includes(name)
}

const cleanup: Array<() => void> = []

afterEach(async () => {
  while (cleanup.length > 0) cleanup.pop()?.()
  // Leave no mirror behind for the next test file.
  for (const name of await listDatabases()) {
    if (name.startsWith('docflow-')) {
      await new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase(name)
        request.onsuccess = () => resolve()
        request.onerror = () => resolve()
        request.onblocked = () => resolve()
      })
    }
  }
})

interface FakeDeleteRequest {
  onsuccess: (() => void) | null
  onerror: (() => void) | null
  onblocked: (() => void) | null
  error: unknown
}

function stubDeleteDatabase(
  trigger: (request: FakeDeleteRequest) => void,
): void {
  const factory = indexedDB as IDBFactory & { deleteDatabase: IDBFactory['deleteDatabase'] }
  const original = factory.deleteDatabase
  factory.deleteDatabase = (() => {
    const request: FakeDeleteRequest = {
      onsuccess: null,
      onerror: null,
      onblocked: null,
      error: null,
    }
    setTimeout(() => trigger(request), 0)
    return request as unknown as IDBOpenDBRequest
  }) as IDBFactory['deleteDatabase']
  cleanup.push(() => {
    factory.deleteDatabase = original
  })
}

function stubStorageEstimate(
  estimate: NonNullable<StorageManager['estimate']>,
): void {
  const descriptor = Object.getOwnPropertyDescriptor(navigator, 'storage')
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: { estimate },
  })
  cleanup.push(() => {
    if (descriptor) {
      Object.defineProperty(navigator, 'storage', descriptor)
    } else {
      Reflect.deleteProperty(navigator as unknown as Record<string, unknown>, 'storage')
    }
  })
}

function quotaExceededError(): Error {
  const error = new Error('quota exceeded')
  error.name = 'QuotaExceededError'
  return error
}

describe('offline mirror lifecycle — issue #162', () => {
  it('defaults to the back-compat `docflow-<room>` key', () => {
    expect(resolveMirrorKey('room-1')).toBe('docflow-room-1')
    expect(resolveMirrorKey('room-1', '  ')).toBe('docflow-room-1')
    expect(resolveMirrorKey('room-1', ' docflow-tenant-user-room-1 ')).toBe(
      'docflow-tenant-user-room-1',
    )
  })

  it('purges a mirror without a live collaboration instance and remounts empty', async () => {
    const first = createCollaboration({ room: 'purge-standalone', user, offline: true })
    appendParagraph(first.ydoc, 'cached secret')
    await first.persistence!.whenSynced
    await pause()
    first.destroy()
    expect(await databaseExists('docflow-purge-standalone')).toBe(true)

    const result = await purgeOfflineMirror({ room: 'purge-standalone' })
    expect(result).toMatchObject({ status: 'deleted', database: 'docflow-purge-standalone' })
    expect(await databaseExists('docflow-purge-standalone')).toBe(false)

    const second = createCollaboration({ room: 'purge-standalone', user, offline: true })
    await second.whenReady
    expect(fragmentText(second.ydoc)).toBe('')
    second.destroy()
  })

  it('purges a live setup and stops persisting later edits', async () => {
    const collab = createCollaboration({ room: 'purge-live', user, offline: true })
    expect(collab.mirrorDatabase).toBe('docflow-purge-live')
    appendParagraph(collab.ydoc, 'before purge')
    await collab.persistence!.whenSynced
    await pause()

    const result = await collab.purgeOfflineMirror!()
    expect(result.status).toBe('deleted')
    expect(await databaseExists('docflow-purge-live')).toBe(false)

    appendParagraph(collab.ydoc, 'after purge')
    await pause(50)
    collab.destroy()
    expect(await databaseExists('docflow-purge-live')).toBe(false)

    const remount = createCollaboration({ room: 'purge-live', user, offline: true })
    await remount.whenReady
    expect(fragmentText(remount.ydoc)).toBe('')
    remount.destroy()
  })

  it('isolates identities that use different mirror keys for the same room', async () => {
    const alice = createCollaboration({
      room: 'shared-room',
      user,
      offline: true,
      mirrorKey: 'docflow-tenant-alice-shared-room',
    })
    appendParagraph(alice.ydoc, 'alice-only')
    await alice.persistence!.whenSynced
    await pause()
    alice.destroy()

    const bob = createCollaboration({
      room: 'shared-room',
      user: { name: 'Bob', color: '#00ff00' },
      offline: true,
      mirrorKey: 'docflow-tenant-bob-shared-room',
    })
    await bob.whenReady
    expect(fragmentText(bob.ydoc)).not.toContain('alice-only')
    bob.destroy()

    expect(await databaseExists('docflow-tenant-alice-shared-room')).toBe(true)
    expect(await databaseExists('docflow-tenant-bob-shared-room')).toBe(true)
  })

  it('does not re-merge pre-downgrade cached edits after a purge', async () => {
    const writer = createCollaboration({ room: 'downgrade', user, offline: true })
    appendParagraph(writer.ydoc, 'written while editor')
    await writer.persistence!.whenSynced
    await pause()
    writer.destroy()

    await purgeOfflineMirror({ room: 'downgrade' })

    // The downgraded session reconnects as a viewer; only the server state
    // may enter the doc, so the cached paragraph must be gone.
    const viewer = createCollaboration({
      room: 'downgrade',
      user: { name: 'Alice', color: '#ff0000' },
      offline: true,
    })
    await viewer.whenReady
    expect(fragmentText(viewer.ydoc)).toBe('')
    viewer.destroy()
  })

  it('emits a typed quota-high warning without blocking attach', async () => {
    stubStorageEstimate(async () => ({ usage: 95, quota: 100 }))
    const warnings: OfflineMirrorWarning[] = []
    const collab = createCollaboration({
      room: 'quota-high',
      user,
      offline: true,
      onOfflineWarning: (warning) => warnings.push(warning),
    })
    expect(collab.persistence).toBeDefined()

    await waitFor(() => warnings.length > 0)
    expect(warnings[0]).toMatchObject({
      code: 'quota-high',
      database: 'docflow-quota-high',
      ratio: 0.95,
    })
    collab.destroy()
  })

  it('reports QuotaExceededError once and detaches after destroy', async () => {
    const warnings: OfflineMirrorWarning[] = []
    const collab = createCollaboration({
      room: 'quota-exceeded',
      user,
      offline: true,
      onOfflineWarning: (warning) => warnings.push(warning),
    })
    const dispatch = () => {
      const event = new Event('unhandledrejection') as Event & { reason?: unknown }
      Object.defineProperty(event, 'reason', { value: quotaExceededError() })
      window.dispatchEvent(event)
    }

    dispatch()
    dispatch()
    await pause()
    expect(warnings.filter((warning) => warning.code === 'quota-exceeded')).toHaveLength(1)

    collab.destroy()
    dispatch()
    await pause()
    expect(warnings.filter((warning) => warning.code === 'quota-exceeded')).toHaveLength(1)
  })

  it('resolves `blocked` when the delete request never settles', async () => {
    stubDeleteDatabase(() => undefined)
    const result = await purgeOfflineMirror({ room: 'blocked', timeoutMs: 10 })
    expect(result.status).toBe('blocked')
  })

  it('resolves `error` when the delete request fails', async () => {
    stubDeleteDatabase((request) => {
      request.error = new Error('delete failed')
      request.onerror?.()
    })
    const result = await purgeOfflineMirror({ room: 'delete-error' })
    expect(result.status).toBe('error')
    expect(result.error?.message).toContain('delete failed')
  })
})
