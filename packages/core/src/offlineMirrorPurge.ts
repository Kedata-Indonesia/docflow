/**
 * Issue #162 — deleting the offline mirror database.
 *
 * `y-indexeddb`'s `destroy()` only closes the connection, and `lib0`'s delete
 * helper has no `onblocked` handler, so the purge path wraps
 * `indexedDB.deleteDatabase()` itself and always settles inside `timeoutMs`.
 */

import { toError } from './offlineMirrorErrors.js'
import { resolveMirrorKey } from './offlineMirrorKey.js'

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
   * Default 2000ms.
   */
  timeoutMs?: number
}

const DEFAULT_PURGE_TIMEOUT_MS = 2000

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

function getIndexedDBFactory(): IDBFactory | undefined {
  return typeof indexedDB === 'undefined' ? undefined : indexedDB
}
