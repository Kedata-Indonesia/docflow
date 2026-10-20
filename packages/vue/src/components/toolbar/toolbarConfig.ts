import type { ToolbarItem } from '@kedata-indonesia/docflow-core'
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  CheckSquare,
  Code,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  Highlighter,
  Image,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Palette,
  Quote,
  Strikethrough,
  Table,
  Underline,
} from 'lucide-vue-next'

export type IconMapKey =
  | 'Bold'
  | 'Italic'
  | 'Underline'
  | 'Strikethrough'
  | 'Heading1'
  | 'Heading2'
  | 'Heading3'
  | 'Heading4'
  | 'Heading5'
  | 'Heading6'
  | 'List'
  | 'ListOrdered'
  | 'CheckSquare'
  | 'Quote'
  | 'Link'
  | 'Code'
  | 'Image'
  | 'Table'
  | 'AlignLeft'
  | 'AlignCenter'
  | 'AlignRight'
  | 'AlignJustify'
  | 'FileText'
  | 'Palette'
  | 'Highlighter'

export const iconMap: Record<IconMapKey, unknown> = {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Link: LinkIcon,
  Code,
  Image,
  Table,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  FileText,
  Palette,
  Highlighter,
}

export function resolveIcon(name?: string) {
  if (!name) return null
  return (iconMap as Record<string, unknown>)[name] ?? null
}

export const activeClass = 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-100'
export const inactiveClass =
  'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-white/5'

export const controlBaseClass =
  'docs-editor-toolbar__control inline-flex h-8 flex-shrink-0 items-center justify-center rounded-md p-1 text-slate-600 transition-all disabled:opacity-40 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'

export const sidebarActiveClass = 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-100'
export const sidebarInactiveClass =
  'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-white/5'

// Plugin toolbar items are categorized so common groups collapse into compact
// dropdowns (Google-Docs style). Headings are dropped here — they're covered by
// the paragraph-style <select>. Anything uncategorized renders as a flat button.
export const HEADING_ACTIONS = [
  'toggleHeading1',
  'toggleHeading2',
  'toggleHeading3',
  'toggleHeading4',
  'toggleHeading5',
  'toggleHeading6',
]
export const ALIGN_ACTIONS = ['alignLeft', 'alignCenter', 'alignRight', 'alignJustify']
export const LIST_ACTIONS = ['toggleBulletList', 'toggleOrderedList', 'toggleTaskList']
export const INSERT_ACTIONS = [
  'setLink',
  'insertImage',
  'insertTable',
  'toggleBlockquote',
  'toggleCodeBlock',
  'insertFootnote',
  'insertPageBreak',
  'setPageBreak',
  'togglePageBreak',
  'addPageBreak',
]
export const COLOR_ACTIONS = ['setTextColor', 'setHighlight']

// Font family. Each option carries the actual CSS stack — stored on the
// TextStyle mark via setFontFamily (FontFamilyExtension) so switching a font
// works and round-trips with the document — plus a label for the dropdown.
export const FONT_OPTIONS = [
  { value: 'Inter, ui-sans-serif, system-ui, sans-serif', label: 'Inter' },
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial' },
  { value: '"Times New Roman", Times, serif', label: 'Times New Roman' },
  { value: 'Georgia, "Times New Roman", serif', label: 'Georgia' },
  { value: 'Garamond, "Times New Roman", serif', label: 'Garamond' },
  { value: 'Calibri, "Segoe UI", sans-serif', label: 'Calibri' },
  { value: '"Segoe UI", Tahoma, sans-serif', label: 'Segoe UI' },
  { value: 'Verdana, Geneva, sans-serif', label: 'Verdana' },
  { value: 'Roboto, Arial, sans-serif', label: 'Roboto' },
  { value: '"Open Sans", Helvetica, sans-serif', label: 'Open Sans' },
  { value: 'Lora, Georgia, serif', label: 'Lora' },
  { value: 'Merriweather, Georgia, serif', label: 'Merriweather' },
  { value: '"JetBrains Mono", "Courier New", monospace', label: 'JetBrains Mono' },
  { value: '"Courier New", Courier, monospace', label: 'Courier New' },
]
export const DEFAULT_FONT_STACK = FONT_OPTIONS[0].value

/**
 * Font-size ladder used by the `−` / `+` stepper: each click moves one entry, so
 * the list must stay gap-free in the ranges users step through — a missing entry
 * makes the control jump (28 → 36, #158).
 */
export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 48, 72]
export const DEFAULT_FONT_SIZE = 11
export const MIN_FONT_SIZE = 1
export const MAX_FONT_SIZE = 400

export function toolbarItemLabel(t: (key: string) => string, item: ToolbarItem): string {
  return item.labelKey ? t(item.labelKey) : (item.label ?? item.id)
}
