/**
 * Where the AI provider's config (base URL + credentials + model) lives —
 * the host decides (pluggable AI provider — issue #119, plan §4.4).
 *
 * The URL and the key are a pair and travel together. The library ships three
 * reference implementations; hosts may write their own (e.g. keyed per-tenant
 * in their own backend). No URL is hardcoded anywhere — `httpKeyStorage`
 * receives its endpoints from the host, keeping the library backend-agnostic
 * (docs/LIBRARY_CONTRACT.md rule 3).
 */

export type Auth =
  | { type: 'bearer'; apiKey: string }
  | { type: 'header'; name: string; value: string }
  | { type: 'none' }

export interface AIConfig {
  baseUrl: string
  auth: Auth
  model: string
}

export interface KeyStorage {
  get(): Promise<AIConfig | null>
  set(value: AIConfig): Promise<void>
  clear(): Promise<void>
}

/** In-memory storage — for tests and SSR (no persistence). */
export function memoryKeyStorage(initial: AIConfig | null = null): KeyStorage {
  let value = initial
  return {
    async get() {
      return value
    },
    async set(next: AIConfig) {
      value = next
    },
    async clear() {
      value = null
    },
  }
}

export const LOCAL_STORAGE_KEY = 'docflow:ai-config'

/**
 * Browser `localStorage` persistence — for embedded apps that want the config
 * kept client-side. Note: this stores AI *credentials*, not document data, so
 * it is the host's deliberate choice, not a library persistence leak.
 */
export function localStorageKeyStorage(
  key: string = LOCAL_STORAGE_KEY,
  storage?: Storage,
): KeyStorage {
  const store = (): Storage => {
    const s = storage ?? globalThis.localStorage
    if (!s) throw new Error('localStorageKeyStorage: no Storage available (SSR?)')
    return s
  }
  return {
    async get() {
      const raw = store().getItem(key)
      if (!raw) return null
      try {
        return JSON.parse(raw) as AIConfig
      } catch {
        return null
      }
    },
    async set(value: AIConfig) {
      store().setItem(key, JSON.stringify(value))
    },
    async clear() {
      store().removeItem(key)
    },
  }
}

export interface HttpKeyStorageUrls {
  /** GET → 200 with the AIConfig JSON body, or 404 when unset. */
  getUrl: string
  /** POST with the AIConfig JSON body. */
  setUrl: string
  /** DELETE to clear. */
  deleteUrl: string
  /** Optional fetch override (tests, custom credentials mode). Defaults to global fetch. */
  fetchImpl?: typeof fetch
}

/**
 * Server-backed storage — for our SaaS web app (`/api/ai/config`) and any
 * embedded app that wants credentials kept on its own backend. Endpoints are
 * host-supplied; the library never names a path.
 */
export function httpKeyStorage(urls: HttpKeyStorageUrls): KeyStorage {
  const doFetch = urls.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  return {
    async get() {
      const res = await doFetch(urls.getUrl, { credentials: 'include' })
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`AI config read failed: ${res.status}`)
      return (await res.json()) as AIConfig
    },
    async set(value: AIConfig) {
      const res = await doFetch(urls.setUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(value),
      })
      if (!res.ok) throw new Error(`AI config write failed: ${res.status}`)
    },
    async clear() {
      const res = await doFetch(urls.deleteUrl, { method: 'DELETE', credentials: 'include' })
      if (!res.ok && res.status !== 404) throw new Error(`AI config delete failed: ${res.status}`)
    },
  }
}
