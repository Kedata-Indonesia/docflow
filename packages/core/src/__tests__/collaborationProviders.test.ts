import { describe, it, expect, vi, afterEach } from 'vitest'
import { createCollaborationProvider, waitForProviderSync, whenProviderSynced } from '../collaborationProviders.js'
import type { CollaborationProvider } from '../collaborationProviders.js'
import * as Y from 'yjs'

/** Minimal stand-in for y-websocket's provider: `sync`/`synced` events + flag. */
function fakeProvider(synced = false) {
  const listeners = new Map<string, Set<() => void>>()
  return {
    synced,
    listenerCount: () => [...listeners.values()].reduce((n, set) => n + set.size, 0),
    on(event: string, callback: () => void) {
      const set = listeners.get(event) ?? new Set()
      set.add(callback)
      listeners.set(event, set)
    },
    off(event: string, callback: () => void) {
      listeners.get(event)?.delete(callback)
    },
    emit(event: string) {
      for (const callback of [...(listeners.get(event) ?? [])]) callback()
    },
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('createCollaborationProvider', () => {
  it('returns null when no transport is configured', () => {
    const provider = createCollaborationProvider(new Y.Doc(), { room: 'r' })
    expect(provider).toBeNull()
  })

  it('rejects a websocket provider without a URL', () => {
    expect(() =>
      createCollaborationProvider(new Y.Doc(), { room: 'r', provider: 'websocket' }),
    ).toThrow(/websocketUrl is required/)
  })
})

describe('waitForProviderSync (issue #117)', () => {
  it('resolves immediately when the provider is already synced', async () => {
    const provider = fakeProvider(true)
    await expect(waitForProviderSync(provider, 1000)).resolves.toBeUndefined()
    expect(provider.listenerCount()).toBe(0)
  })

  it('resolves on the first sync event and releases both listeners', async () => {
    const provider = fakeProvider(false)
    const settled = waitForProviderSync(provider, 1000)

    expect(provider.listenerCount()).toBe(2)
    provider.emit('synced')
    await expect(settled).resolves.toBeUndefined()
    expect(provider.listenerCount()).toBe(0)
  })

  it('falls back to the timeout and still releases its listeners and timer', async () => {
    vi.useFakeTimers()
    const provider = fakeProvider(false)
    let settled = false
    const gate = waitForProviderSync(provider, 500).then(() => {
      settled = true
    })

    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(499)
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    await gate
    expect(settled).toBe(true)
    // No listener may survive the timeout: a later reconnect must not re-run it.
    expect(provider.listenerCount()).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('whenProviderSynced', () => {
  it('resolves immediately for a non-websocket provider (webrtc has no first-sync event)', async () => {
    // `instanceof WebsocketProvider` is false for anything webrtc-shaped, and
    // constructing a real WebrtcProvider needs a signaling server.
    const webrtcLike = { destroy: () => undefined } as unknown as CollaborationProvider
    await expect(whenProviderSynced(webrtcLike)).resolves.toBeUndefined()
  })
})
