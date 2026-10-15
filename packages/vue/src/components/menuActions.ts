import { ALL_MENU_ACTIONS } from './menuStructure.js'
import { isHeaderBarLocalAction } from './headerBarActions.js'
import { EDIT_FORMAT_MENU_ACTIONS } from '../composables/useEditCommands.js'

/**
 * Menu-action classification (issue #153).
 *
 * The playground (and any host) can dim the items it does not implement by
 * passing `unimplementedActions` to `<DocsEditor>`. Which items those are has to
 * come from a single derived source of truth, so nothing here is curated by
 * hand from the menu tree: `ALL_MENU_ACTIONS` is derived from
 * `menuStructure.ts`, and the classify-away sets are the *real* dispatchers'
 * key sets. A drift test asserts all three stay in sync (see
 * `__tests__/menuActions.drift.test.ts`).
 *
 * Two categories are deliberately NOT host-owned:
 *
 * 1. `LIBRARY_MENU_ACTIONS` — the actions the library performs end to end
 *    (they are the keys of the command map in `useDocsEditorMenu.ts`). Clicking
 *    them changes editor state or opens library UI, with no host involvement.
 * 2. `EDIT_FORMAT_MENU_ACTIONS` — the Edit/Format command map in
 *    `useEditCommands.ts` (bold, undo, insert-table, …). Same reasoning: the
 *    library owns command execution.
 *
 * A third group is resolved *inside the header bar* and also needs no host:
 * `set-locale:*` (see `headerBarActions.ts`, entries with `host: false`).
 *
 * Everything else stays host-owned — including `export:*`, `share`, `move`,
 * `trash`, `rename` and `add-to-starred`, which only emit an event. `rename` is
 * host-owned on purpose: it opens the in-header rename input, but its only
 * effect is `emit('update:title')`, so the host has to persist the new title.
 *
 * Hosts that DO implement actions (`docflow-app` handles export/share/open-doc)
 * simply pass a smaller list — or nothing at all, in which case every menu item
 * stays active.
 */
export const LIBRARY_MENU_ACTIONS: readonly string[] = [
  'page-setup',
  'print',
  'version-history',
  'details',
  'email',
  'find-replace',
  'insert-link',
  'security',
  'insert-header',
  'insert-footer',
  'toggle-pageless',
  'toggle-left-sidebar',
  'toggle-ruler',
  'toggle-focus-mode',
  'mode-editing',
  'mode-suggesting',
  'mode-viewing',
  'review-suggestions',
  'new-help-me-create',
  'insert-footnote',
]

/**
 * Menu actions the host app has to implement: the library emits an event (or
 * nothing at all) and the host does the work. Derived — never hand-listed.
 */
export const HOST_OWNED_ACTIONS: readonly string[] = ALL_MENU_ACTIONS.filter(
  (action) =>
    !LIBRARY_MENU_ACTIONS.includes(action) &&
    !EDIT_FORMAT_MENU_ACTIONS.includes(action) &&
    !isHeaderBarLocalAction(action),
)
