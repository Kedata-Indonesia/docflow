/**
 * Where the AI provider's config (base URL + credentials + model) lives —
 * the host decides (pluggable AI provider — issue #119, plan §4.4).
 *
 * The URL and the key are a pair and travel together. The library ships three
 * reference implementations; hosts may write their own (e.g. keyed per-tenant
 * in their own backend). No *endpoint* is hardcoded on the storage path —
 * `httpKeyStorage` receives its endpoints from the host, keeping the library
 * backend-agnostic (docs/LIBRARY_CONTRACT.md rule 3). The only hardcoded host
 * is the overridable `DEFAULT_BASE_URL` default in `claudeProvider.ts`
 * (contract rule 4 exception; see §5 of docs/LIBRARY_CONTRACT.md).
 *
 * ⚠️ Secrets note (issue #179): `localStorageKeyStorage` **and**
 * `sessionStorageKeyStorage` keep an API key in the browser in plaintext — any
 * script running on the same origin can read either one. `sessionStorage` only
 * shortens the *lifetime* (closing the tab drops it); it is **not** an XSS
 * mitigation. The only option that keeps the key out of the browser entirely is
 * `httpKeyStorage` — with `AIConfig.visibility: 'admin-only'` plus the host's
 * completion proxy, the key never reaches the client. That is the recommended
 * production path. `ttlMs` (both browser storages) bounds how long a stored key
 * stays readable, and hosts should call `clear()` on sign-out.
 * See docs/AI_PROVIDERS.md §5.
 */

export type Auth =
  | { type: 'bearer'; apiKey: string }
  | { type: 'header'; name: string; value: string }
  | { type: 'none' }

export interface AIConfig {
  baseUrl: string
  auth: Auth
  model: string
  /**
   * Who may receive this config in their browser (issue #126).
   * - `shared` (default): any authenticated user gets it via GET and calls
   *   the LLM browser-direct — the #119 model.
   * - `admin-only`: only tenant admins get it; everyone else must complete
   *   through the server's `/api/ai/complete` proxy so the key never leaves
   *   the server.
   */
  visibility?: 'shared' | 'admin-only'
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
/** Same logical key, kept in `sessionStorage` instead (issue #179). */
export const SESSION_STORAGE_KEY = 'docflow:ai-config'

/**
 * Shape the browser storages write. The marker lets `get()` tell an envelope
 * apart from a config written by an older version, which stored the bare
 * `AIConfig` JSON — those are still read, so upgrading hosts keep their key.
 */
interface StoredAIConfig {
  __docflowKeyStorage: 1
  config: AIConfig
  /** Epoch ms after which the entry is dead. Absent = no expiry. */
  expiresAt?: number
}

export interface BrowserKeyStorageOptions {
  /**
   * Drop the credentials once the entry is older than this many milliseconds:
   * `get()` then returns null and removes the entry. Rotating a key is the
   * host's job, but a TTL bounds how long a key the user forgot about stays
   * readable.
   */
  ttlMs?: number
}

function isStoredAIConfig(value: unknown): value is StoredAIConfig {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { __docflowKeyStorage?: unknown; config?: unknown }
  return (
    candidate.__docflowKeyStorage === 1 &&
    typeof candidate.config === 'object' &&
    candidate.config !== null
  )
}

/**
 * Shared implementation behind `localStorageKeyStorage` /
 * `sessionStorageKeyStorage` (not exported: hosts pass a `Storage` to one of
 * those instead). The `Storage` is resolved lazily on every call so SSR /
 * late-hydration environments don't fail at import time.
 */
function webStorageKeyStorage(
  resolve: () => Storage,
  key: string = LOCAL_STORAGE_KEY,
  options: BrowserKeyStorageOptions = {},
): KeyStorage {
  const { ttlMs } = options
  if (ttlMs !== undefined && (!Number.isFinite(ttlMs) || ttlMs <= 0)) {
    throw new Error(
      `webStorageKeyStorage: ttlMs must be a positive number of milliseconds, got ${String(ttlMs)}`,
    )
  }
  return {
    async get() {
      const raw = resolve().getItem(key)
      if (!raw) return null
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        return null
      }
      if (!isStoredAIConfig(parsed)) {
        // Written before the envelope existed — still a valid config.
        return parsed as AIConfig
      }
      if (parsed.expiresAt !== undefined && Date.now() >= parsed.expiresAt) {
        resolve().removeItem(key)
        return null
      }
      return parsed.config
    },
    async set(value: AIConfig) {
      const stored: StoredAIConfig = {
        __docflowKeyStorage: 1,
        config: value,
        ...(ttlMs === undefined ? {} : { expiresAt: Date.now() + ttlMs }),
      }
      resolve().setItem(key, JSON.stringify(stored))
    },
    async clear() {
      resolve().removeItem(key)
    },
  }
}

/**
 * Browser `localStorage` persistence — for embedded apps that want the config
 * kept client-side. Note: this stores AI *credentials*, not document data, so
 * it is the host's deliberate choice, not a library persistence leak.
 *
 * The key survives browser restarts and is readable by any script on the
 * origin — see the module secrets note, and prefer `sessionStorageKeyStorage`
 * (shorter lifetime) or `httpKeyStorage` (key never reaches the client) when the
 * embedding app is not fully trusted.
 */
export function localStorageKeyStorage(
  key: string = LOCAL_STORAGE_KEY,
  storage?: Storage,
  options: BrowserKeyStorageOptions = {},
): KeyStorage {
  return webStorageKeyStorage(() => {
    const s = storage ?? globalThis.localStorage
    if (!s) throw new Error('localStorageKeyStorage: no localStorage available (SSR?)')
    return s
  }, key, options)
}

/**
 * Browser `sessionStorage` persistence (issue #179) — the same key/value pair
 * as `localStorageKeyStorage`, scoped to the tab: closing it (or the browser)
 * drops the credentials, and a reload keeps them.
 *
 * What this does and does not do: it **reduces the lifetime** of a key the user
 * typed into an embedded app (no "I logged out but the key is still there"
 * surprise after the tab closes). It is **not** a defence against XSS — a
 * script running on the origin reads `sessionStorage` as easily as
 * `localStorage`. Only `httpKeyStorage` (plus `visibility: 'admin-only'` and the
 * host's completion proxy) keeps the key out of the browser.
 */
export function sessionStorageKeyStorage(
  key: string = SESSION_STORAGE_KEY,
  storage?: Storage,
  options: BrowserKeyStorageOptions = {},
): KeyStorage {
  return webStorageKeyStorage(() => {
    const s = storage ?? globalThis.sessionStorage
    if (!s) throw new Error('sessionStorageKeyStorage: no sessionStorage available (SSR?)')
    return s
  }, key, options)
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
