/**
 * Shared Vitest setup — restores browser storage globals hidden by Node >= 26.
 *
 * Why this exists:
 * Node >= 26 defines `globalThis.localStorage` / `globalThis.sessionStorage`
 * getters that return `undefined` unless the process is started with
 * `--localstorage-file`. Vitest's happy-dom environment (`populateGlobal`)
 * only copies a window key onto `global` when that key is absent from `global`
 * (`if (k in global) return keysArray.includes(k)`), and `localStorage` is not
 * in its `KEYS` allow-list. So under Node >= 26 a mirrored happy-dom test sees
 * `window.localStorage === undefined`, even though a fresh happy-dom `Window`
 * provides a working `Storage`.
 *
 * This shim installs an in-memory `Storage` only when the global is missing, so
 * tests behave identically on Node 20/22 (where happy-dom's storage is copied)
 * and Node >= 26.
 */

function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  const storage: Storage = {
    get length(): number {
      return store.size
    },
    clear(): void {
      store.clear()
    },
    getItem(key: string): string | null {
      return store.has(key) ? (store.get(key) as string) : null
    },
    key(index: number): string | null {
      return [...store.keys()][index] ?? null
    },
    removeItem(key: string): void {
      store.delete(key)
    },
    setItem(key: string, value: string): void {
      store.set(key, String(value))
    },
  }
  return storage
}

const globalScope = globalThis as typeof globalThis & {
  localStorage?: Storage
  sessionStorage?: Storage
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  let existing: Storage | undefined
  try {
    existing = globalScope[name]
  } catch {
    // A runtime may expose a throwing storage getter — treat it as absent.
    existing = undefined
  }

  if (!existing) {
    Object.defineProperty(globalThis, name, {
      value: createMemoryStorage(),
      configurable: true,
      writable: true,
    })
  }
}
