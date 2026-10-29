/**
 * Issue #162 — typed offline-mirror warnings and their console fallback.
 *
 * One emitter per mirror attachment, deduplicated by warning code so a
 * quota-exceeded burst does not flood the host or the console.
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

export type OfflineWarningHandler = (warning: OfflineMirrorWarning) => void

export interface WarningEmitter {
  (warning: OfflineMirrorWarning): void
  close: () => void
}

export function createWarningEmitter(
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
