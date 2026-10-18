import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  httpKeyStorage,
  localStorageKeyStorage,
  memoryKeyStorage,
  sessionStorageKeyStorage,
  LOCAL_STORAGE_KEY,
  SESSION_STORAGE_KEY,
  type AIConfig,
} from '../keyStorage.js'

const config: AIConfig = {
  baseUrl: 'https://llm.example.com/v1',
  auth: { type: 'bearer', apiKey: 'sk-test' },
  model: 'test-model',
}

describe('memoryKeyStorage', () => {
  it('round-trips and clears', async () => {
    const storage = memoryKeyStorage()
    expect(await storage.get()).toBeNull()
    await storage.set(config)
    expect(await storage.get()).toEqual(config)
    await storage.clear()
    expect(await storage.get()).toBeNull()
  })

  it('accepts an initial value', async () => {
    expect(await memoryKeyStorage(config).get()).toEqual(config)
  })
})

describe('localStorageKeyStorage', () => {
  it('round-trips through the provided Storage', async () => {
    const storage = localStorageKeyStorage('test-key', window.localStorage)
    await storage.clear()
    expect(await storage.get()).toBeNull()
    await storage.set(config)
    expect(await storage.get()).toEqual(config)
    await storage.clear()
    expect(await storage.get()).toBeNull()
  })

  it('returns null on corrupted JSON instead of throwing', async () => {
    window.localStorage.setItem('bad-key', '{not json')
    const storage = localStorageKeyStorage('bad-key', window.localStorage)
    expect(await storage.get()).toBeNull()
    window.localStorage.removeItem('bad-key')
  })
})

describe('sessionStorageKeyStorage (#179)', () => {
  afterEach(() => {
    window.sessionStorage.clear()
    window.localStorage.removeItem(LOCAL_STORAGE_KEY)
  })

  it('round-trips through sessionStorage and clear() really removes the value', async () => {
    const storage = sessionStorageKeyStorage('test-session-key', window.sessionStorage)

    await storage.clear()
    expect(await storage.get()).toBeNull()

    await storage.set(config)
    expect(await storage.get()).toEqual(config)
    expect(window.sessionStorage.getItem('test-session-key')).not.toBeNull()

    await storage.clear()
    expect(await storage.get()).toBeNull()
    expect(window.sessionStorage.getItem('test-session-key')).toBeNull()
  })

  it('defaults to the browser sessionStorage, not localStorage', async () => {
    const storage = sessionStorageKeyStorage()

    await storage.set(config)

    expect(window.sessionStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull()
    // The whole point of the option: nothing lands in the persistent store.
    expect(window.localStorage.getItem(LOCAL_STORAGE_KEY)).toBeNull()
    expect(await storage.get()).toEqual(config)

    await storage.clear()
    expect(window.sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull()
  })
})

describe('browser storage TTL (#179)', () => {
  afterEach(() => {
    vi.useRealTimers()
    window.localStorage.removeItem(LOCAL_STORAGE_KEY)
    window.sessionStorage.clear()
  })

  it('reads a fresh entry, then drops and deletes it once the TTL passes', async () => {
    vi.useFakeTimers({ now: 1_000_000 })
    const storage = localStorageKeyStorage(LOCAL_STORAGE_KEY, window.localStorage, { ttlMs: 60_000 })

    await storage.set(config)
    expect(await storage.get()).toEqual(config)

    vi.advanceTimersByTime(59_999)
    expect(await storage.get()).toEqual(config)

    vi.advanceTimersByTime(2)
    expect(await storage.get()).toBeNull()
    // Expiry is enforced by deleting the credential, not by hiding it.
    expect(window.localStorage.getItem(LOCAL_STORAGE_KEY)).toBeNull()
  })

  it('keeps a sessionStorage entry readable while its TTL holds', async () => {
    vi.useFakeTimers({ now: 1_000_000 })
    const storage = sessionStorageKeyStorage(SESSION_STORAGE_KEY, window.sessionStorage, { ttlMs: 1_000 })

    await storage.set(config)
    vi.advanceTimersByTime(999)
    expect(await storage.get()).toEqual(config)
    vi.advanceTimersByTime(1)
    expect(await storage.get()).toBeNull()
  })

  it('never expires an entry written without ttlMs', async () => {
    vi.useFakeTimers({ now: 1_000_000 })
    const storage = localStorageKeyStorage(LOCAL_STORAGE_KEY, window.localStorage)

    await storage.set(config)
    vi.advanceTimersByTime(365 * 24 * 60 * 60 * 1000)

    expect(await storage.get()).toEqual(config)
  })

  it('rejects a non-positive ttlMs instead of silently never expiring', () => {
    expect(() => localStorageKeyStorage(LOCAL_STORAGE_KEY, window.localStorage, { ttlMs: 0 })).toThrow(
      /ttlMs/,
    )
    expect(() => sessionStorageKeyStorage(SESSION_STORAGE_KEY, window.sessionStorage, { ttlMs: -1 })).toThrow(
      /ttlMs/,
    )
  })

  it('still reads a config stored before the envelope existed (upgrade path)', async () => {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(config))
    const storage = localStorageKeyStorage(LOCAL_STORAGE_KEY, window.localStorage, { ttlMs: 1_000 })

    expect(await storage.get()).toEqual(config)
  })
})

describe('httpKeyStorage', () => {
  const urls = {
    getUrl: 'https://app.example.com/api/ai/config',
    setUrl: 'https://app.example.com/api/ai/config',
    deleteUrl: 'https://app.example.com/api/ai/config',
  }

  it('GET → config on 200, null on 404', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(config), { status: 200 }))
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
    const storage = httpKeyStorage({ ...urls, fetchImpl })

    expect(await storage.get()).toEqual(config)
    expect(await storage.get()).toBeNull()
    expect(fetchImpl.mock.calls[0][0]).toBe(urls.getUrl)
  })

  it('POSTs the config as JSON on set', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    const storage = httpKeyStorage({ ...urls, fetchImpl })

    await storage.set(config)

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(urls.setUrl)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual(config)
  })

  it('DELETEs on clear and tolerates 404', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 404 }))
    const storage = httpKeyStorage({ ...urls, fetchImpl })

    await expect(storage.clear()).resolves.toBeUndefined()
    expect((fetchImpl.mock.calls[0][1] as RequestInit).method).toBe('DELETE')
  })

  it('throws on non-OK responses', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('boom', { status: 500 }))
    const storage = httpKeyStorage({ ...urls, fetchImpl })

    await expect(storage.get()).rejects.toThrow('500')
    await expect(storage.set(config)).rejects.toThrow('500')
    await expect(storage.clear()).rejects.toThrow('500')
  })
})
