import { describe, expect, it, vi } from 'vitest'
import {
  httpKeyStorage,
  localStorageKeyStorage,
  memoryKeyStorage,
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
