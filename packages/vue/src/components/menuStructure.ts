import type { Component } from 'vue'
import type { DocumentMode } from '@kedata-indonesia/docflow-core'
import {
  Star, Share2, Users, ChevronDown, FilePlus2, FolderOpen, Copy, Mail, Download,
  FileText, Pencil, FolderInput, History, Info, ShieldCheck, Languages, Settings,
  Printer, Undo2, Redo2, Scissors, ClipboardPaste, Text as TextIcon, Search,
  PanelLeft, Maximize2, Ruler, Trash2, NotebookPen, ImagePlus, Table, Code2, Minus,
  BarChart3,
  Link2, SeparatorHorizontal, Heading, PanelBottom, List, Hash, ScrollText,
  Bold, Italic, Underline, Heading1, Heading2, Heading3, IndentIncrease,
  IndentDecrease,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, ListOrdered, ListChecks,
  RemoveFormatting, SpellCheck, SlidersHorizontal, Puzzle, Keyboard, Bug, CircleHelp,
  Sparkles, LayoutTemplate, Calendar, MapPin, Eye, PenLine, GitPullRequest, BookOpen,
} from 'lucide-vue-next'
import type { Locale } from '../composables/useLocale.js'

/**
 * The header menu tree as plain data (issue #153).
 *
 * Extracted verbatim out of `HeaderBar.vue` so the full action list is
 * *derivable* — `collectMenuActions()` turns the tree into the action ids the
 * library can classify (see `menuActions.ts`). Labels stay context-driven, so
 * the component keeps its reactivity: it calls `buildMenus()` inside a
 * `computed`, and locale/prop changes rebuild the tree.
 */

export interface MenuSubItem {
  label: string
  action: string
  badge?: string
  icon?: Component
  shortcut?: string
  /** Toggle sub-items (e.g. the View ▸ Document mode radios) carry the state. */
  checked?: boolean
}

export interface MenuItem {
  label: string
  action?: string
  divider?: boolean
  /** Keyboard shortcut hint displayed right-aligned (Google Docs style). */
  shortcut?: string
  /** Toggle items render a check gutter; true shows the check mark. */
  checked?: boolean
  /** Leading icon (16x16 Lucide) for visual scanability per issue #140. */
  icon?: Component
  sub?: MenuSubItem[]
}

/** Everything `buildMenus()` derives from the component instance. */
export interface MenuStructureContext {
  t: (key: string) => string
  isMac: boolean
  outlineOpen: boolean
  focusMode: boolean
  showRuler: boolean
  mode: DocumentMode
  pageless: boolean
  supportedLocales: readonly Locale[]
  getLocaleName: (locale: Locale) => string
  /** Bibliography insertion needs the citation plugin (node + command). */
  hasCitationPlugin: boolean
}

/**
 * Returns a platform-appropriate modifier shortcut hint.
 * Pass the key portion after the modifier, e.g. `'Z'`, `'⇧V'`.
 * On Mac:     `⌘Z`, `⌘⇧V`
 * On Windows/Linux: `Ctrl+Z`, `Ctrl+Shift+V`
 */
function modKey(isMac: boolean, key: string): string {
  return isMac ? `⌘${key}` : `Ctrl+${key.replace('⇧', 'Shift+')}`
}

export function buildMenus(ctx: MenuStructureContext): Record<string, { label: string; items: MenuItem[] }> {
  const { t, mode } = ctx
  return {
    File: {
      label: t('header.file'),
      items: [
        {
          label: t('header.new'), icon: FilePlus2, sub: [
            { label: t('header.newDocument'), action: 'new-doc', icon: FilePlus2 },
            { label: t('header.helpMeCreate'), action: 'new-help-me-create', icon: Sparkles },
            { label: t('header.fromTemplate'), action: 'new-from-template', icon: LayoutTemplate },
          ]
        },
        { label: t('header.open'), action: 'open-doc', icon: FolderOpen },
        { label: t('header.makeACopy'), action: 'duplicate', icon: Copy },
        { label: 'divider', divider: true },
        { label: t('header.share'), action: 'share', icon: Share2 },
        { label: t('header.email'), action: 'email', icon: Mail },
        {
          label: t('header.download'), icon: Download, sub: [
            { label: t('header.docx'), action: 'export:docx', badge: 'DOCX', icon: FileText },
            { label: t('header.pdf'), action: 'export:pdf', badge: 'PDF', icon: FileText },
            { label: t('header.odt'), action: 'export:odt', badge: 'ODT', icon: FileText },
            { label: t('header.txt'), action: 'export:txt', badge: 'TXT', icon: FileText },
            { label: t('header.rtf'), action: 'export:rtf', badge: 'RTF', icon: FileText },
            { label: t('header.htmlZip'), action: 'export:html-zip', badge: 'ZIP', icon: FileText },
            { label: t('header.html'), action: 'export:html', badge: 'HTML', icon: FileText },
            { label: t('header.markdown'), action: 'export:markdown', badge: 'MD', icon: FileText },
          ]
        },
        { label: 'divider', divider: true },
        { label: t('header.rename'), action: 'rename', icon: Pencil },
        { label: t('header.move'), action: 'move', icon: FolderInput },
        { label: t('header.addToStarred'), action: 'add-to-starred', icon: Star },
        { label: t('header.moveToTrash'), action: 'trash', icon: Trash2 },
        { label: 'divider', divider: true },
        { label: t('header.versionHistory'), action: 'version-history', icon: History },
        { label: 'divider', divider: true },
        { label: t('header.details'), action: 'details', icon: Info },
        { label: t('header.security'), action: 'security', icon: ShieldCheck },
        { label: 'divider', divider: true },
        {
          label: t('header.language'), icon: Languages, sub: ctx.supportedLocales.map((loc) => ({
            label: ctx.getLocaleName(loc),
            action: `set-locale:${loc}`,
          }))
        },
        { label: t('header.pageSetup'), action: 'page-setup', icon: Settings },
        { label: t('header.print'), action: 'print', icon: Printer },
      ],
    },
    Edit: {
      label: t('header.edit'),
      items: [
        { label: t('header.undo'), action: 'undo', shortcut: modKey(ctx.isMac, 'Z'), icon: Undo2 },
        { label: t('header.redo'), action: 'redo', shortcut: modKey(ctx.isMac, 'Y'), icon: Redo2 },
        { label: 'divider', divider: true },
        { label: t('header.cut'), action: 'cut', shortcut: modKey(ctx.isMac, 'X'), icon: Scissors },
        { label: t('header.copy'), action: 'copy', shortcut: modKey(ctx.isMac, 'C'), icon: Copy },
        { label: t('header.paste'), action: 'paste', shortcut: modKey(ctx.isMac, 'V'), icon: ClipboardPaste },
        { label: t('header.pasteWithoutFormatting'), action: 'paste-without-formatting', shortcut: modKey(ctx.isMac, '⇧V'), icon: ClipboardPaste },
        { label: 'divider', divider: true },
        { label: t('header.selectAll'), action: 'select-all', shortcut: modKey(ctx.isMac, 'A'), icon: TextIcon },
        { label: t('header.delete'), action: 'delete', icon: Trash2 },
        { label: 'divider', divider: true },
        { label: t('header.findAndReplace'), action: 'find-replace', shortcut: modKey(ctx.isMac, '⇧H'), icon: Search },
      ],
    },
    View: {
      label: t('header.view'),
      items: [
        { label: t('header.showSidebar'), action: 'toggle-left-sidebar', checked: ctx.outlineOpen, icon: PanelLeft },
        { label: 'divider', divider: true },
        { label: t('header.focusMode'), action: 'toggle-focus-mode', checked: ctx.focusMode, icon: Maximize2 },
        { label: t('header.showRuler'), action: 'toggle-ruler', checked: ctx.showRuler, icon: Ruler },
        { label: 'divider', divider: true },
        {
          label: t('header.documentMode'), icon: Eye, sub: [
            { label: t('header.modeEditing'), action: 'mode-editing', checked: mode === 'editing', icon: Pencil },
            { label: t('header.modeSuggesting'), action: 'mode-suggesting', checked: mode === 'suggesting', icon: PenLine },
            { label: t('header.modeViewing'), action: 'mode-viewing', checked: mode === 'viewing', icon: Eye },
          ]
        },
      ],
    },
    Insert: {
      label: t('header.insert'),
      items: [
        { label: t('header.meetingNotes'), action: 'meeting-notes', icon: NotebookPen },
        { label: t('header.emailDraft'), action: 'email-draft', icon: Mail },
        { label: 'divider', divider: true },
        { label: t('header.image'), action: 'insert-image', icon: ImagePlus },
        { label: t('header.table'), action: 'insert-table', icon: Table },
        {
          label: t('header.chart'), icon: BarChart3, sub: [
            { label: t('header.chartBar'), action: 'insert-chart-bar', icon: BarChart3 },
            { label: t('header.chartColumn'), action: 'insert-chart-column', icon: BarChart3 },
            { label: t('header.chartLine'), action: 'insert-chart-line', icon: BarChart3 },
            { label: t('header.chartPie'), action: 'insert-chart-pie', icon: BarChart3 },
          ]
        },
        { label: t('header.codeBlock'), action: 'insert-code', icon: Code2 },
        { label: t('header.horizontalLine'), action: 'horizontal-line', icon: Minus },
        { label: 'divider', divider: true },
        { label: t('header.link'), action: 'insert-link', shortcut: modKey(ctx.isMac, 'K'), icon: Link2 },
        { label: 'divider', divider: true },
        {
          label: t('header.smartElements'), icon: Sparkles, sub: [
            { label: t('header.dateChip'), action: 'insert-date-chip', icon: Calendar },
            { label: t('header.peopleChip'), action: 'insert-people-chip', icon: Users },
            { label: t('header.fileChip'), action: 'insert-file-chip', icon: FileText },
            { label: t('header.dropdownChip'), action: 'insert-dropdown-chip', icon: ChevronDown },
            { label: t('header.locationChip'), action: 'insert-location-chip', icon: MapPin },
          ]
        },
        { label: 'divider', divider: true },
        {
          label: t('header.break'), icon: SeparatorHorizontal, sub: [
            { label: t('header.pageBreak'), action: 'insert-page-break', shortcut: t('header.pageBreakShortcut'), icon: Minus },
          ]
        },
        { label: 'divider', divider: true },
        { label: t('header.header'), action: 'insert-header', icon: Heading },
        { label: t('header.footer'), action: 'insert-footer', icon: PanelBottom },
        { label: t('header.footnote'), action: 'insert-footnote', icon: List },
        ...(ctx.hasCitationPlugin
          ? [{ label: t('header.bibliography'), action: 'insert-bibliography', icon: BookOpen }]
          : []),
        { label: t('header.tableOfContents'), action: 'insert-toc', icon: List },
        { label: 'divider', divider: true },
        {
          label: t('header.pageNumbers'), icon: Hash, sub: [
            { label: t('header.pageNumberInHeader'), action: 'page-numbers-header', icon: Heading },
            { label: t('header.pageNumberInFooter'), action: 'page-numbers-footer', icon: PanelBottom },
          ]
        },
      ],
    },
    Format: {
      label: t('header.format'),
      items: [
        { label: t('header.bold'), action: 'bold', icon: Bold },
        { label: t('header.italic'), action: 'italic', icon: Italic },
        { label: t('header.underline'), action: 'underline', icon: Underline },
        { label: 'divider', divider: true },
        { label: t('header.heading1'), action: 'heading1', icon: Heading1 },
        { label: t('header.heading2'), action: 'heading2', icon: Heading2 },
        { label: t('header.heading3'), action: 'heading3', icon: Heading3 },
        { label: 'divider', divider: true },
        {
          label: t('header.alignIndent'), icon: IndentIncrease, sub: [
            { label: t('header.alignLeft'), action: 'align-left', icon: AlignLeft },
            { label: t('header.alignCenter'), action: 'align-center', icon: AlignCenter },
            { label: t('header.alignRight'), action: 'align-right', icon: AlignRight },
            { label: t('header.alignJustify'), action: 'align-justify', icon: AlignJustify },
            { label: t('header.indent'), action: 'indent', icon: IndentIncrease },
            { label: t('header.outdent'), action: 'outdent', icon: IndentDecrease },
          ]
        },
        {
          label: t('header.bulletsNumbering'), icon: List, sub: [
            { label: t('header.bulletList'), action: 'bullet-list', icon: List },
            { label: t('header.numberedList'), action: 'numbered-list', icon: ListOrdered },
            { label: t('header.taskList'), action: 'task-list', icon: ListChecks },
          ]
        },
        { label: 'divider', divider: true },
        { label: t('header.pagelessFormat'), action: 'toggle-pageless', checked: ctx.pageless, icon: ScrollText },
        { label: 'divider', divider: true },
        { label: t('header.clearFormatting'), action: 'clear-formatting', icon: RemoveFormatting },
      ],
    },
    Tools: {
      label: t('header.tools'),
      items: [
        { label: t('header.spellCheck'), action: 'spellcheck', icon: SpellCheck },
        { label: t('header.wordCount'), action: 'word-count', icon: Hash },
        { label: 'divider', divider: true },
        { label: t('header.reviewSuggestedEdits'), action: 'review-suggestions', icon: GitPullRequest },
        { label: 'divider', divider: true },
        { label: t('header.preferences'), action: 'preferences', icon: SlidersHorizontal },
      ],
    },
    Extensions: {
      label: t('header.extensions'),
      items: [
        { label: t('header.manageExtensions'), action: 'manage-extensions', icon: Puzzle },
      ],
    },
    Help: {
      label: t('header.help'),
      items: [
        { label: t('header.keyboardShortcuts'), action: 'keyboard-shortcuts', icon: Keyboard },
        { label: 'divider', divider: true },
        { label: t('header.reportIssue'), action: 'report-issue', icon: Bug },
        { label: t('header.about'), action: 'about', icon: CircleHelp },
      ],
    },
  }
}

/**
 * Every action id in the tree, in menu order (top-level items + sub-items,
 * dividers skipped). Action ids are stable literals — never derived from
 * labels — so translations cannot change the classification.
 */
export function collectMenuActions(menus: ReturnType<typeof buildMenus>): string[] {
  const actions: string[] = []
  for (const menu of Object.values(menus)) {
    for (const item of menu.items) {
      if (item.divider) continue
      if (item.action) actions.push(item.action)
      if (item.sub) {
        for (const sub of item.sub) actions.push(sub.action)
      }
    }
  }
  return actions
}

/**
 * The full action list, computed once from a label-free stub context. The stub
 * only needs to be *shape*-correct: `collectMenuActions()` reads `action` /
 * `divider` / `sub` fields, none of which depend on translations or props.
 */
export const ALL_MENU_ACTIONS: string[] = collectMenuActions(buildMenus({
  t: (key) => key,
  isMac: false,
  outlineOpen: false,
  focusMode: false,
  showRuler: false,
  mode: 'editing',
  pageless: false,
  supportedLocales: ['en', 'id'],
  getLocaleName: (locale) => locale,
  // The stub must include conditional items so `ALL_MENU_ACTIONS` is complete.
  hasCitationPlugin: true,
}))
