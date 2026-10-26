import { IndexeddbPersistence } from 'y-indexeddb'
import type * as Y from 'yjs'

/**
 * Issue #162 — offline mirror lifecycle. `y-indexeddb` mirrors the room's
 * Y.Doc into a database named `docflow-<room>` by default and never deletes
 * it: `destroy()` only closes the connection. This module owns the missing
 * lifecycle — key resolution, purge, and quota warnings — so hosts can drop
 * local bytes on logout / role downgrade and stay inside the storage budget.
 */

export type OfflineMirrorWarning =
  | {
      code: 'quota-high'
      database: string
      usage: number
      quota: number
      ratio: number
    }
  | { code: 'quota-exceeded'; database: string }
  | { code: 'mirror-unavailable'; database: string; error: Error }

type OfflineWarningHandler = (warning: OfflineMirrorWarning) => void

export type OfflineMirrorPurgeStatus =
  /** The database was deleted (or did not exist). */
  | 'deleted'
  /** Another connection kept it open past the timeout; call again later. */
  | 'blocked'
  /** IndexedDB is unavailable (SSR, private mode, storage disabled). */
  | 'unavailable'
  | 'error'

export interface PurgeOfflineMirrorResult {
  status: OfflineMirrorPurgeStatus
  database: string
  error?: Error
}

export interface PurgeOfflineMirrorOptions {
  room: string
  /** See `CollaborationOptions.mirrorKey`. Defaults to `docflow-<room>`. */
  mirrorKey?: string
  /**
   * How long to wait for a blocked deletion before resolving `blocked`.
   * Default 2000ms. `lib0`'s delete helper has no `onblocked` handler, which
   * is why we wrap `indexedDB.deleteDatabase()` ourselves.
   */
  timeoutMs?: number
}

export interface OfflineMirrorHandle {
  database: string
  persistence: IndexeddbPersistence
  /**
   * Resolves once the mirror hydrated, or immediately when the database could
   * not be opened. Never hangs like `whenSynced` does on a rejected open.
   */
  whenSettled: Promise<void>
  dispose: () => void
}

interface OfflineMirrorAttachOptions {
  database: string
  quotaWarnRatio?: number
  onWarning?: OfflineWarningHandler
}

const DEFAULT_PURGE_TIMEOUT_MS = 2000

const DEFAULT_QUOTA_WARN_RATIO = 0.9

/**
 * The default keeps pre-#162 behaviour (`docflow-<room>`) so existing mounted
 * mirrors keep hydrating. Hosts with account switching should pass a scoped
 * key, e.g. `docflow-<tenant>-<userId>-<room>`.
 */
export function resolveMirrorKey(room: string, mirrorKey?: string): string {
  const candidate = mirrorKey?.trim()
  return candidate ? candidate : `docflow-${room}`
}

function resolveQuotaWarnRatio(value?: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1
    ? value
    : DEFAULT_QUOTA_WARN_RATIO
}

/**
 * Attach the offline mirror and wire its lifecycle warnings. The mirror still
 * loads synchronously-ish at construction (hosts await `whenReady`), so the
 * quota pre-flight is advisory and never delays hydration.
 */
export function attachOfflineMirror(
  doc: Y.Doc,
  options: OfflineMirrorAttachOptions,
): OfflineMirrorHandle {
  const { database } = options
  const warn = createWarningEmitter(database, options.onWarning)
  const persistence = new IndexeddbPersistence(database, doc)
  const stopQuotaWatch = watchQuotaExceeded(database, warn)

  void runQuotaPreflight(database, resolveQuotaWarnRatio(options.quotaWarnRatio), warn)

  // y-indexeddb never settles `whenSynced` when `openDB` rejects (private
  // mode / blocked storage), which would hang the #117 `whenReady` gate. Its
  // `_db` promise is the only signal available on the public surface, so race
  // it: a successful open stays pending and leaves the gate to `whenSynced`,
  // a rejection resolves immediately and reports the typed warning.
  const openFailure = new Promise<void>((resolve) => {
    const dbPromise = (persistence as unknown as { _db?: Promise<IDBDatabase> })._db
    if (!dbPromise) return
    void dbPromise.then(
      () => undefined,
      (error: unknown) => {
        warn({ code: 'mirror-unavailable', database, error: toError(error) })
        resolve()
      },
    )
  })
  const whenSettled = Promise.race([
    persistence.whenSynced.then(() => undefined),
    openFailure,
  ])

  return {
    database,
    persistence,
    whenSettled,
    dispose: () => {
      warn.close()
      stopQuotaWatch()
    },
  }
}

/**
 * Delete the mirror database for a room without needing a live collaboration
 * instance — the logout / account-switch case. Purge is destructive: call it
 * only after the last local edit reached the server (see the lifecycle policy
 * in `docs/guides/COLLAB_INTEGRATION.md`).
 */
export function purgeOfflineMirror(
  options: PurgeOfflineMirrorOptions,
): Promise<PurgeOfflineMirrorResult> {
  return deleteMirrorDatabase(
    resolveMirrorKey(options.room, options.mirrorKey),
    options.timeoutMs,
  )
}

export function deleteMirrorDatabase(
  database: string,
  timeoutMs: number = DEFAULT_PURGE_TIMEOUT_MS,
): Promise<PurgeOfflineMirrorResult> {
  const factory = getIndexedDBFactory()
  if (!factory) {
    return Promise.resolve({ status: 'unavailable', database })
  }
  const timeout = timeoutMs > 0 ? timeoutMs : DEFAULT_PURGE_TIMEOUT_MS
  return new Promise<PurgeOfflineMirrorResult>((resolve) => {
    let settled = false
    const timeoutId = setTimeout(() => {
      if (settled) return
      settled = true
      resolve({ status: 'blocked', database })
    }, timeout)
    const finish = (result: PurgeOfflineMirrorResult) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      resolve(result)
    }

    let request: IDBOpenDBRequest
    try {
      request = factory.deleteDatabase(database)
    } catch (error) {
      finish({ status: 'error', database, error: toError(error) })
      return
    }
    request.onsuccess = () => finish({ status: 'deleted', database })
    request.onerror = () => finish({ status: 'error', database, error: toError(request.error) })
    request.onblocked = () => finish({ status: 'blocked', database })
  })
}

interface WarningEmitter {
  (warning: OfflineMirrorWarning): void
  close: () => void
}

function createWarningEmitter(
  database: string,
  handler: OfflineWarningHandler | undefined,
): WarningEmitter {
  const seen = new Set<OfflineMirrorWarning['code']>()
  let closed = false
  const emit = (warning: OfflineMirrorWarning) => {
    if (closed || seen.has(warning.code)) return
    seen.add(warning.code)
    if (handler) {
      handler(warning)
      return
    }
    console.warn(`[collab] offline mirror "${database}": ${describeWarning(warning)}`)
  }
  return Object.assign(emit, {
    close: () => {
      closed = true
    },
  })
}

function describeWarning(warning: OfflineMirrorWarning): string {
  switch (warning.code) {
    case 'quota-high':
      return (
        `using ${Math.round(warning.ratio * 100)}% of the origin storage quota ` +
        `(${warning.usage}/${warning.quota} bytes). Purge unused mirrors with ` +
        'purgeOfflineMirror() or scope mirrorKey per user.'
      )
    case 'quota-exceeded':
      return (
        'a write was rejected with QuotaExceededError — offline edits may not be ' +
        'persisted. Call purgeOfflineMirror() to reclaim space.'
      )
    case 'mirror-unavailable':
      return `indexedDB is unavailable (${warning.error.message}) — edits will not persist offline.`
  }
}

async function runQuotaPreflight(
  database: string,
  ratio: number,
  warn: WarningEmitter,
): Promise<void> {
  const estimate = getStorageEstimate()
  if (!estimate) return
  try {
    const result = await estimate()
    const usage = result.usage ?? 0
    const quota = result.quota ?? 0
    if (usage <= 0 || quota <= 0) return
    const actualRatio = usage / quota
    if (actualRatio >= ratio) {
      warn({ code: 'quota-high', database, usage, quota, ratio: actualRatio })
    }
  } catch {
    // Advisory only: a failing estimate must never block collaboration.
  }
}

function getStorageEstimate(): (() => Promise<StorageEstimate>) | undefined {
  if (typeof navigator === 'undefined') return undefined
  const storage = (navigator as Navigator & { storage?: StorageManager }).storage
  if (!storage || typeof storage.estimate !== 'function') return undefined
  return () => storage.estimate()
}

function watchQuotaExceeded(database: string, warn: WarningEmitter): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => undefined
  }
  // `y-indexeddb` writes inside `doc.on('update')` without awaiting the IDB
  // request, so a QuotaExceededError surfaces as an unhandled rejection and
  // there is no public error hook to subscribe to. Listen only while the
  // mirror is attached and drop the listener in `dispose()`.
  const onUnhandledRejection = (event: Event) => {
    const reason = (event as Event & { reason?: unknown }).reason
    if (!isQuotaExceededError(reason)) return
    warn({ code: 'quota-exceeded', database })
  }
  window.addEventListener('unhandledrejection', onUnhandledRejection)
  return () => window.removeEventListener('unhandledrejection', onUnhandledRejection)
}

function isQuotaExceededError(reason: unknown): boolean {
  if (!reason || typeof reason !== 'object') return false
  const name = (reason as { name?: unknown }).name
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED'
}

function getIndexedDBFactory(): IDBFactory | undefined {
  return typeof indexedDB === 'undefined' ? undefined : indexedDB
}

function toError(value: unknown): Error {
  if (value instanceof Error) return value
  if (typeof value === 'string') return new Error(value)
  return new Error('Unknown offline mirror error')
}
