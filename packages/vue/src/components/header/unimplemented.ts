/**
 * Host-owned menu items (issue #153).
 *
 * The host tells us which actions it does not implement. Such items stay
 * visible — dimmed, annotated and still clickable — instead of being hidden,
 * because the click must keep emitting (the playground's event log is the
 * point). One lookup, one set of pure helpers shared by the menu bar and its
 * sub-menu panels.
 */

/** A flagged action, with an optional host-supplied reason for the tooltip. */
export type UnimplementedEntry = string | { action: string; reason?: string }

/** action id → host reason (`undefined` = use the localized default). */
export type UnimplementedMap = Map<string, string | undefined>

export function buildUnimplementedMap(
  entries: readonly UnimplementedEntry[],
): UnimplementedMap {
  const lookup: UnimplementedMap = new Map()
  for (const entry of entries) {
    if (typeof entry === 'string') lookup.set(entry, undefined)
    else lookup.set(entry.action, entry.reason)
  }
  return lookup
}

/** `true` when the host flagged this action as one it does not implement. */
export function isUnimplemented(lookup: UnimplementedMap, action?: string): boolean {
  return !!action && lookup.has(action)
}

/** Tooltip for a flagged action: the host's reason, else the localized default. */
export function unimplementedHint(
  lookup: UnimplementedMap,
  action: string | undefined,
  t: (key: string) => string,
): string | undefined {
  if (!action || !isUnimplemented(lookup, action)) return undefined
  return lookup.get(action) || t('header.hostOwnedHint')
}

/** Flagged items are dimmed and lose the hover fill but stay focusable. */
export function menuItemClass(lookup: UnimplementedMap, action?: string): string[] {
  return [
    'flex w-full items-center justify-between gap-6 px-4 py-2 text-left',
    isUnimplemented(lookup, action) ? 'opacity-50' : 'hover:bg-slate-50 dark:hover:bg-white/5',
  ]
}
