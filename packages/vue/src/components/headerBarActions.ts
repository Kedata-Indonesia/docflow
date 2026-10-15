import type { Locale } from '../composables/useLocale.js'

/**
 * The header-bar action table (issue #153).
 *
 * One table drives **both** the click dispatcher in `HeaderBar.vue` and the
 * host/library classification in `menuActions.ts`, so the two can never drift:
 * every action the header bar resolves is listed here exactly once, and the
 * `host` flag says whether resolving it finishes the job (library-owned) or
 * only fires an event the host has to implement.
 */

export type ExportFormat = 'markdown' | 'html' | 'html-zip' | 'txt' | 'docx' | 'pdf' | 'odt' | 'rtf'

/** What the table needs from the component instance it runs against. */
export interface HeaderBarActionHandlers {
  exportDocument: (format: ExportFormat) => void
  share: () => void
  toggleStar: () => void
  rename: () => void
  setLocale: (locale: Locale) => void
}

export interface HeaderBarActionEntry {
  /** `true` when implementing the action is the host's job — the bar only emits. */
  host: boolean
  match: (action: string) => boolean
  run: (action: string, handlers: HeaderBarActionHandlers) => void
}

export const HEADER_BAR_ACTIONS: readonly HeaderBarActionEntry[] = [
  {
    // Export never produces a file in-library — the host owns the exporters.
    host: true,
    match: (action) => action.startsWith('export:'),
    run: (action, handlers) => handlers.exportDocument(action.replace('export:', '') as ExportFormat),
  },
  {
    host: true,
    match: (action) => action === 'share',
    run: (_action, handlers) => handlers.share(),
  },
  {
    host: true,
    match: (action) => action === 'add-to-starred',
    run: (_action, handlers) => handlers.toggleStar(),
  },
  {
    // Rename opens the in-header input but only emits `update:title`; the host
    // persists the new title, so the action stays host-owned.
    host: true,
    match: (action) => action === 'rename',
    run: (_action, handlers) => handlers.rename(),
  },
  {
    host: false,
    match: (action) => action.startsWith('set-locale:'),
    run: (action, handlers) => handlers.setLocale(action.replace('set-locale:', '') as Locale),
  },
]

/** Resolve an action against the table — the single dispatch point. */
export function findHeaderBarAction(action: string): HeaderBarActionEntry | undefined {
  return HEADER_BAR_ACTIONS.find((entry) => entry.match(action))
}

/** Actions the header bar resolves itself, so the library owns them end to end. */
export function isHeaderBarLocalAction(action: string): boolean {
  const entry = findHeaderBarAction(action)
  return !!entry && !entry.host
}

/** Actions the header bar only emits — implementing them is the host's job. */
export function isHeaderBarHostAction(action: string): boolean {
  const entry = findHeaderBarAction(action)
  return !!entry && entry.host
}
