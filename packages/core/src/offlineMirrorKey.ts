/**
 * Issue #162 — IndexedDB database naming for the offline mirror.
 *
 * Split out of `offlineMirror.ts` because both the attach path and the purge
 * path need it, and the purge path must not import the attach module (which
 * pulls in `y-indexeddb`).
 */

/**
 * The default keeps pre-#162 behaviour (`docflow-<room>`) so existing mounted
 * mirrors keep hydrating. Hosts with account switching should pass a scoped
 * key, e.g. `docflow-<tenant>-<userId>-<room>`.
 */
export function resolveMirrorKey(room: string, mirrorKey?: string): string {
  const candidate = mirrorKey?.trim()
  return candidate ? candidate : `docflow-${room}`
}
