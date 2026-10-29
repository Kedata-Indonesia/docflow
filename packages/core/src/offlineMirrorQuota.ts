/**
 * Issue #162 — storage-quota intelligence for the offline mirror.
 *
 * Two independent signals, both advisory:
 * - a pre-flight `navigator.storage.estimate()` check at attach time, and
 * - an `unhandledrejection` listener for the `QuotaExceededError` that
 *   `y-indexeddb` raises from inside `doc.on('update')` without awaiting the
 *   IDB request.
 *
 * Neither may block hydration: a failing estimate resolves silently.
 */

import type { WarningEmitter } from './offlineMirrorWarnings.js'

const DEFAULT_QUOTA_WARN_RATIO = 0.9

export function resolveQuotaWarnRatio(value?: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1
    ? value
    : DEFAULT_QUOTA_WARN_RATIO
}

export async function runQuotaPreflight(
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

/**
 * `y-indexeddb` writes inside `doc.on('update')` without awaiting the IDB
 * request, so a QuotaExceededError surfaces as an unhandled rejection and there
 * is no public error hook to subscribe to. Listen only while the mirror is
 * attached and drop the listener in `dispose()`.
 */
export function watchQuotaExceeded(database: string, warn: WarningEmitter): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => undefined
  }
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
