/**
 * The keys of `editFormatMenuCommands`, exported so menu classification
 * (issue #153, `components/menuActions.ts`) can subtract them from the
 * host-owned set without duplicating the map. `menuActions.drift.test.ts`
 * asserts this list and the real map never diverge.
 */
export const EDIT_FORMAT_MENU_ACTIONS: readonly string[] = [
  // Edit menu
  'undo',
  'redo',
  'select-all',
  'cut',
  'copy',
  'paste',
  'paste-without-formatting',
  'delete',
  // Format menu — text styles
  'bold',
  'italic',
  'underline',
  'heading1',
  'heading2',
  'heading3',
  // Format menu — align & indent
  'align-left',
  'align-center',
  'align-right',
  'align-justify',
  'indent',
  'outdent',
  // Format menu — bullets & numbering
  'bullet-list',
  'numbered-list',
  'task-list',
  // Insert menu — editor-scoped inserts
  'horizontal-line',
  'page-numbers-header',
  'page-numbers-footer',
  'clear-formatting',
  'insert-image',
  'insert-table',
  'insert-chart-bar',
  'insert-chart-column',
  'insert-chart-line',
  'insert-chart-pie',
  'insert-code',
  'insert-page-break',
  'insert-bibliography',
  'insert-toc',
  'insert-date-chip',
  'insert-people-chip',
  'insert-file-chip',
  'insert-dropdown-chip',
  'insert-location-chip',
]
