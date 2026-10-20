/**
 * Shared Tailwind class strings for repeated form and toolbar primitives.
 *
 * Keep these byte-for-byte identical to the classes they replace so the
 * refactor stays visually inert. See issue #176.
 */
export const FIELD_LABEL =
  'mb-1 block text-[10px] font-semibold text-slate-500 dark:text-slate-400'

export const FIELD_INPUT =
  'w-full rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-2 text-xs dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-200'

export const TOOLBAR_DIVIDER =
  'mx-1 h-5 w-px flex-shrink-0 bg-slate-200 dark:bg-white/10'

export const DIALOG_INPUT =
  'w-full rounded-md border border-slate-200 bg-transparent px-3 py-1.5 text-xs focus:outline-none dark:border-slate-700'

export const CHECKBOX_LABEL =
  'flex items-center gap-3 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300 select-none'
