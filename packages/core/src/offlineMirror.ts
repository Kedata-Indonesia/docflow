/**
 * Issue #162 — offline mirror lifecycle. `y-indexeddb` mirrors the room's
 * Y.Doc into a database named `docflow-<room>` by default and never deletes
 * it: `destroy()` only closes the connection. This module wires the attach
 * path; the supporting concerns live in their own modules:
 *
 * - `offlineMirrorKey.ts` — database naming (`resolveMirrorKey`)
 * - `offlineMirrorWarnings.ts` — typed `quota-high` / `quota-exceeded` /
 *   `mirror-unavailable` warnings and the console fallback
 * - `offlineMirrorQuota.ts` — pre-flight estimate + rejection watcher
 * - `offlineMirrorPurge.ts` — host-initiated destructive delete
 *
 * Everything public is re-exported from here, so `./offlineMirror.js` stays
 * the single import site for consumers and packages.
 */

import { IndexeddbPersistence } from 'y-indexeddb'
import type * as Y from 'yjs'
import { runQuotaPreflight, resolveQuotaWarnRatio, watchQuotaExceeded } from './offlineMirrorQuota.js'
import { toError } from './offlineMirrorErrors.js'
import { createWarningEmitter, type OfflineWarningHandler } from './offlineMirrorWarnings.js'

export type { OfflineMirrorWarning } from './offlineMirrorWarnings.js'
export { resolveMirrorKey } from './offlineMirrorKey.js'
export {
  deleteMirrorDatabase,
  purgeOfflineMirror,
  type OfflineMirrorPurgeStatus,
  type PurgeOfflineMirrorOptions,
  type PurgeOfflineMirrorResult,
} from './offlineMirrorPurge.js'

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
