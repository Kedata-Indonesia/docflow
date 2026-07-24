<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import type { Editor } from '@tiptap/core'
import type { DocsEditorPlugin, ToolbarItem } from '@kedata-indonesia/docflow-core'
import {
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
  Link as LinkIcon,
  Code,
  Image,
  Table,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  MessageSquare,
  History,
  Sparkles,
  FileText,
  BookOpen,
  Undo2,
  Redo2,
  Printer,
  SpellCheck,
  Minus,
  Plus,
  ChevronDown,
  Palette,
  Highlighter,
} from 'lucide-vue-next'
import type { SidebarKey } from '../types.js'
import { useLocale } from '../composables/useLocale.js'
import ColorPickerDropdown from './ColorPickerDropdown.vue'

const { t } = useLocale()

const props = defineProps<{
  actions: Record<string, (...args: unknown[]) => boolean>
  plugins?: DocsEditorPlugin[]
  editor?: Editor | null
  activeSidebar?: SidebarKey | null
}>()

const emit = defineEmits<{
  'toggle-sidebar': [key: SidebarKey]
  print: []
  undo: []
  redo: []
  'toggle-left-sidebar': []
}>()

type IconMapKey =
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

const iconMap: Record<IconMapKey, unknown> = {
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

function resolveIcon(name?: string) {
  if (!name) return null
  return (iconMap as Record<string, unknown>)[name] ?? null
}

interface ToolbarGroup {
  pluginId: string
  items: ToolbarItem[]
}

const toolbarGroups = computed<ToolbarGroup[]>(() => {
  const groups: ToolbarGroup[] = []
  for (const plugin of props.plugins ?? []) {
    if (!plugin.toolbar || plugin.toolbar.length === 0) continue
    groups.push({ pluginId: plugin.id, items: plugin.toolbar })
  }
  return groups
})

const activeClass = 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-100'
const inactiveClass =
  'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-white/5'

const controlBaseClass =
  'docs-editor-toolbar__control inline-flex h-8 flex-shrink-0 items-center justify-center rounded-md p-1 text-slate-600 transition-all disabled:opacity-40 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'

const sidebarActiveClass = 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-100'
const sidebarInactiveClass =
  'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-white/5'

const selectionTick = ref(0)

function handleTransaction() {
  selectionTick.value++
}

watch(
  () => props.editor,
  (newEditor, oldEditor) => {
    if (oldEditor) {
      oldEditor.off('transaction', handleTransaction)
    }
    if (newEditor) {
      newEditor.on('transaction', handleTransaction)
    }
  },
  { immediate: true }
)

onUnmounted(() => {
  if (props.editor) {
    props.editor.off('transaction', handleTransaction)
  }
})

function isItemActive(item: ToolbarItem): boolean {
  // Establish reactive dependency
  void selectionTick.value
  const editor = props.editor
  if (!editor) return false

  switch (item.action) {
    case 'toggleBold':
      return editor.isActive('bold')
    case 'toggleItalic':
      return editor.isActive('italic')
    case 'toggleUnderline':
      return editor.isActive('underline')
    case 'toggleStrike':
      return editor.isActive('strike')
    case 'toggleHeading1':
      return editor.isActive('heading', { level: 1 })
    case 'toggleHeading2':
      return editor.isActive('heading', { level: 2 })
    case 'toggleHeading3':
      return editor.isActive('heading', { level: 3 })
    case 'toggleHeading4':
      return editor.isActive('heading', { level: 4 })
    case 'toggleHeading5':
      return editor.isActive('heading', { level: 5 })
    case 'toggleHeading6':
      return editor.isActive('heading', { level: 6 })
    case 'toggleBulletList':
      return editor.isActive('bulletList')
    case 'toggleOrderedList':
      return editor.isActive('orderedList')
    case 'toggleTaskList':
      return editor.isActive('taskList')
    case 'toggleBlockquote':
      return editor.isActive('blockquote')
    case 'toggleCodeBlock':
      return editor.isActive('codeBlock')
    case 'setLink':
      return editor.isActive('link')
    case 'alignLeft':
      return editor.isActive({ textAlign: 'left' })
    case 'alignCenter':
      return editor.isActive({ textAlign: 'center' })
    case 'alignRight':
      return editor.isActive({ textAlign: 'right' })
    case 'alignJustify':
      return editor.isActive({ textAlign: 'justify' })
    default:
      return false
  }
}

function runPluginItem(item: ToolbarItem) {
  if (!props.editor) return
  const fn = props.actions[item.action]
  if (typeof fn === 'function') {
    fn(...(item.args ?? []))
    props.editor.commands.focus()
    return
  }
  // fallback to built-in editor command
  const command = (props.editor.commands as Record<string, (...args: unknown[]) => boolean>)[item.action]
  if (typeof command === 'function') {
    command(...(item.args ?? []))
    props.editor.commands.focus()
  }
}

const currentTextColor = computed(() => {
  void selectionTick.value
  return props.editor?.getAttributes('textStyle').color as string | undefined
})

const currentHighlightColor = computed(() => {
  void selectionTick.value
  const highlight = props.editor?.getAttributes('highlight')
  if (highlight?.color) return highlight.color as string
  if (props.editor?.isActive('highlight')) return '#ffff00' // default yellow
  return undefined
})

function applyColor(action: string, color: string) {
  const fn = props.actions[action]
  if (typeof fn === 'function') {
    fn(color)
  } else {
    const command = (props.editor?.commands as Record<string, (...args: unknown[]) => boolean> | undefined)?.[action]
    if (typeof command === 'function') command(color)
  }
  props.editor?.commands.focus()
  activeDropdown.value = null
}

function resetColor(action: string) {
  const chain = props.editor?.chain().focus() as unknown as { unsetColor?: () => { run: () => boolean }; unsetHighlight?: () => { run: () => boolean } } | undefined
  if (!chain) {
    activeDropdown.value = null
    return
  }
  if (action === 'setTextColor') {
    chain.unsetColor?.().run()
  } else if (action === 'setHighlight') {
    chain.unsetHighlight?.().run()
  }
  props.editor?.commands.focus()
  activeDropdown.value = null
}

// ── Grouped toolbar items ────────────────────────────────────────────────
// Plugin toolbar items are categorized so common groups collapse into compact
// dropdowns (Google-Docs style). Headings are dropped here — they're covered by
// the paragraph-style <select>. Anything uncategorized renders as a flat button.
const HEADING_ACTIONS = ['toggleHeading1', 'toggleHeading2', 'toggleHeading3', 'toggleHeading4', 'toggleHeading5', 'toggleHeading6']
const ALIGN_ACTIONS = ['alignLeft', 'alignCenter', 'alignRight', 'alignJustify']
const LIST_ACTIONS = ['toggleBulletList', 'toggleOrderedList', 'toggleTaskList']
const INSERT_ACTIONS = ['setLink', 'insertImage', 'insertTable', 'toggleBlockquote', 'toggleCodeBlock', 'insertFootnote', 'insertPageBreak', 'setPageBreak', 'togglePageBreak', 'addPageBreak']
const COLOR_ACTIONS = ['setTextColor', 'setHighlight']

const allPluginItems = computed(() => toolbarGroups.value.flatMap((g) => g.items))
const alignItems = computed(() => allPluginItems.value.filter((i) => ALIGN_ACTIONS.includes(i.action)))
const listItems = computed(() => allPluginItems.value.filter((i) => LIST_ACTIONS.includes(i.action)))
const insertItems = computed(() => allPluginItems.value.filter((i) => INSERT_ACTIONS.includes(i.action)))
const colorItems = computed(() => allPluginItems.value.filter((i) => COLOR_ACTIONS.includes(i.action)))
const textColorItem = computed(() => colorItems.value.find((i) => i.action === 'setTextColor'))
const highlightItem = computed(() => colorItems.value.find((i) => i.action === 'setHighlight'))
const flatItems = computed(() =>
  allPluginItems.value.filter(
    (i) =>
      !HEADING_ACTIONS.includes(i.action) &&
      !ALIGN_ACTIONS.includes(i.action) &&
      !LIST_ACTIONS.includes(i.action) &&
      !INSERT_ACTIONS.includes(i.action) &&
      !COLOR_ACTIONS.includes(i.action),
  ),
)

const currentAlignIcon = computed(() => {
  void selectionTick.value
  const editor = props.editor
  if (editor) {
    if (editor.isActive({ textAlign: 'center' })) return AlignCenter
    if (editor.isActive({ textAlign: 'right' })) return AlignRight
    if (editor.isActive({ textAlign: 'justify' })) return AlignJustify
  }
  return AlignLeft
})

type DropdownKey = 'heading' | 'font' | 'align' | 'lists' | 'insert' | 'textColor' | 'highlight'
const activeDropdown = ref<DropdownKey | null>(null)
function toggleDropdown(key: DropdownKey) {
  activeDropdown.value = activeDropdown.value === key ? null : key
}
function runFromDropdown(item: ToolbarItem) {
  runPluginItem(item)
  activeDropdown.value = null
}
function closeDropdowns(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.toolbar-dropdown')) activeDropdown.value = null
}
onMounted(() => document.addEventListener('click', closeDropdowns, true))
onUnmounted(() => document.removeEventListener('click', closeDropdowns, true))

function sidebarClass(key: SidebarKey) {
  return props.activeSidebar === key ? sidebarActiveClass : sidebarInactiveClass
}

// The references sidebar is only meaningful when the citation plugin is loaded.
const hasCitationPlugin = computed(() => props.plugins?.some((p) => p.id === 'citation') ?? false)

// The AI sidebar is only meaningful when the host injects an aiStream port.
const hasAI = computed(
  () =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Boolean((props.editor?.storage as any)?.editorContext?.aiStream),
)

function handleUndo() {
  if (props.editor) {
    (props.editor.commands as any).undo()
    props.editor.commands.focus()
  }
  emit('undo')
}

function handleRedo() {
  if (props.editor) {
    (props.editor.commands as any).redo()
    props.editor.commands.focus()
  }
  emit('redo')
}

function handlePrint() {
  emit('print')
}

const PARAGRAPH_OPTIONS = computed(() => [
  { value: 'paragraph', label: t('toolbar.normalText') },
  { value: 'heading-1', label: t('header.heading1') },
  { value: 'heading-2', label: t('header.heading2') },
  { value: 'heading-3', label: t('header.heading3') },
  { value: 'heading-4', label: t('header.heading4') },
  { value: 'heading-5', label: t('header.heading5') },
  { value: 'heading-6', label: t('header.heading6') },
])

function applyParagraphStyle(value: string) {
  const editor = props.editor
  if (editor) {
    if (value === 'paragraph') {
      (editor.commands as any).setParagraph()
    } else {
      const level = parseInt(value.replace('heading-', ''), 10)
      const fn = props.actions[`toggleHeading${level}`]
      if (typeof fn === 'function') {
        fn()
      } else {
        (editor.commands as any).toggleHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 })
      }
    }
    editor.commands.focus()
  }
  activeDropdown.value = null
}

const currentParagraphStyle = computed(() => {
  // Establish reactive dependency
  void selectionTick.value
  const editor = props.editor
  if (!editor) return 'paragraph'
  for (let level = 1; level <= 6; level++) {
    if (editor.isActive('heading', { level })) return `heading-${level}`
  }
  return 'paragraph'
})

const currentParagraphLabel = computed(
  () => PARAGRAPH_OPTIONS.value.find((o) => o.value === currentParagraphStyle.value)?.label ?? t('toolbar.normalText'),
)

// Font family — display-only for now (no font-family command wired to the editor),
// matching the previous <select> behaviour but with a consistent dropdown UI.
const FONT_OPTIONS = [
  { value: 'arial', label: 'Arial' },
  { value: 'inter', label: 'Inter' },
  { value: 'serif', label: 'Serif' },
  { value: 'mono', label: 'Monospace' },
]
const currentFont = ref('arial')
const currentFontLabel = computed(
  () => FONT_OPTIONS.find((o) => o.value === currentFont.value)?.label ?? 'Arial',
)
function applyFont(value: string) {
  currentFont.value = value
  activeDropdown.value = null
  props.editor?.commands.focus()
}

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72]
const DEFAULT_FONT_SIZE = 11

/** Reactively read the font-size from the current selection's TextStyle mark. */
const currentFontSize = computed<number>(() => {
  void selectionTick.value
  const editor = props.editor
  if (!editor) return DEFAULT_FONT_SIZE

  // Check document textStyle mark at selection first
  const attrs = editor.getAttributes('textStyle')
  if (attrs?.fontSize) {
    const parsed = parseInt(attrs.fontSize, 10)
    if (!isNaN(parsed)) return parsed
  }

  // Check stored marks (marks set at cursor position but not yet applied)
  const storedMarks = editor.state.storedMarks
  if (storedMarks) {
    for (const mark of storedMarks) {
      if (mark.type.name === 'textStyle' && mark.attrs.fontSize) {
        const parsed = parseInt(mark.attrs.fontSize as string, 10)
        if (!isNaN(parsed)) return parsed
      }
    }
  }

  // Fallback: read actual rendered font size from the DOM
  if (editor.view?.dom) {
    const baseSize = parseFloat(getComputedStyle(editor.view.dom).fontSize)
    if (!isNaN(baseSize)) {
      const px = Math.round(baseSize)
      // Clamp to nearest FONT_SIZE
      const nearest = FONT_SIZES.reduce((prev, curr) =>
        Math.abs(curr - px) < Math.abs(prev - px) ? curr : prev
      )
      return nearest
    }
  }

  return DEFAULT_FONT_SIZE
})

function handleFontSize(delta: number) {
  console.log('[FontSize] handleFontSize called, delta:', delta, 'editor:', !!props.editor)
  if (!props.editor) return
  const idx = FONT_SIZES.indexOf(currentFontSize.value)
  const startIdx = idx >= 0
    ? idx
    : FONT_SIZES.findIndex(s => s >= currentFontSize.value)
  const nextIdx = Math.min(Math.max((startIdx >= 0 ? startIdx : 0) + delta, 0), FONT_SIZES.length - 1)
  const nextSize = FONT_SIZES[nextIdx]
  console.log('[FontSize] currentFontSize:', currentFontSize.value, '→ nextSize:', nextSize)
  // Use direct command (not chain) to avoid chaining-proxy conflict with the
  // inner setMark calls inside FontSizeExtension.
  const commands = props.editor.commands as any
  console.log('[FontSize] commands.setFontSize type:', typeof commands.setFontSize)
  const result = commands.setFontSize(`${nextSize}px`)
  console.log('[FontSize] setFontSize returned:', result)
  props.editor.commands.focus()
}
</script>

<template>
  <div id="editor-toolbar-row" class="docs-editor-toolbar w-full border-b border-slate-200 bg-white py-1.5 text-slate-600 shadow-sm dark:border-slate-800 dark:bg-[#0b1120] dark:text-slate-300">
    <div class="flex min-h-9 w-full items-center gap-1 px-3 flex-nowrap">
      <!-- Left: undo/redo, print, zoom. (Document-outline toggle is a floating
           button next to the page — see DocsEditor.) -->
      <button
        type="button"
        :class="[controlBaseClass, 'w-8']"
        :title="t('toolbar.undo')"
        :aria-label="t('toolbar.undo')"
        :disabled="!editor"
        @mousedown.prevent
        @click="handleUndo"
      >
        <Undo2 class="h-[18px] w-[18px]" />
      </button>

      <button
        type="button"
        :class="[controlBaseClass, 'w-8']"
        :title="t('toolbar.redo')"
        :aria-label="t('toolbar.redo')"
        :disabled="!editor"
        @mousedown.prevent
        @click="handleRedo"
      >
        <Redo2 class="h-[18px] w-[18px]" />
      </button>

      <span class="mx-1 h-5 w-px flex-shrink-0 bg-slate-200 dark:bg-white/10" />

      <button
        type="button"
        :class="[controlBaseClass, 'w-8']"
        :title="t('toolbar.print')"
        :aria-label="t('toolbar.print')"
        @mousedown.prevent
        @click="handlePrint"
      >
        <Printer class="h-[18px] w-[18px]" />
      </button>

      <button
        type="button"
        :class="[controlBaseClass, 'w-8']"
        :title="t('toolbar.spelling')"
        :aria-label="t('toolbar.spelling')"
        :disabled="!editor"
        @mousedown.prevent
      >
        <SpellCheck class="h-[18px] w-[18px]" />
      </button>

      <button
        type="button"
        :class="[controlBaseClass, 'px-2 text-xs']"
        :title="t('toolbar.zoom')"
        :aria-label="t('toolbar.zoom')"
        @mousedown.prevent
      >
        {{ t('toolbar.zoom') }}
      </button>

      <span class="mx-1 h-5 w-px flex-shrink-0 bg-slate-200 dark:bg-white/10" />

      <!-- Paragraph style -->
      <div class="toolbar-dropdown relative flex-shrink-0">
        <button
          type="button"
          :class="[controlBaseClass, 'w-[116px] justify-between gap-1 px-2 text-xs font-medium']"
          :title="t('toolbar.paragraphStyle')"
          :aria-label="t('toolbar.paragraphStyle')"
          :disabled="!editor"
          @mousedown.prevent
          @click.stop="toggleDropdown('heading')"
        >
          <span class="truncate">{{ currentParagraphLabel }}</span>
          <ChevronDown class="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
        </button>
        <div
          v-if="activeDropdown === 'heading'"
          class="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-xl dark:border-slate-700 dark:bg-[#0e1525]"
        >
          <button
            v-for="opt in PARAGRAPH_OPTIONS"
            :key="opt.value"
            type="button"
            :class="['flex w-full items-center px-3 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-white/5', currentParagraphStyle === opt.value ? 'text-blue-600 dark:text-blue-300' : 'text-slate-700 dark:text-slate-200']"
            :disabled="!editor"
            @mousedown.prevent
            @click="applyParagraphStyle(opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>

      <!-- Font family -->
      <div class="toolbar-dropdown relative flex-shrink-0">
        <button
          type="button"
          :class="[controlBaseClass, 'w-[100px] justify-between gap-1 px-2 text-xs font-medium']"
          :title="t('toolbar.fontFamily')"
          :aria-label="t('toolbar.fontFamily')"
          :disabled="!editor"
          @mousedown.prevent
          @click.stop="toggleDropdown('font')"
        >
          <span class="truncate">{{ currentFontLabel }}</span>
          <ChevronDown class="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
        </button>
        <div
          v-if="activeDropdown === 'font'"
          class="absolute left-0 top-full z-50 mt-1 min-w-[160px] rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-xl dark:border-slate-700 dark:bg-[#0e1525]"
        >
          <button
            v-for="opt in FONT_OPTIONS"
            :key="opt.value"
            type="button"
            :class="['flex w-full items-center px-3 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-white/5', currentFont === opt.value ? 'text-blue-600 dark:text-blue-300' : 'text-slate-700 dark:text-slate-200']"
            @mousedown.prevent
            @click="applyFont(opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>

      <!-- Font size -->
      <button
        type="button"
        :class="[controlBaseClass, 'w-7 text-sm']"
        :title="t('toolbar.decreaseFontSize')"
        :aria-label="t('toolbar.decreaseFontSize')"
        :disabled="!editor"
        @mousedown.prevent="handleFontSize(-1)"
      >
        <Minus class="h-3.5 w-3.5" />
      </button>
      <span class="flex h-8 w-7 flex-shrink-0 select-none items-center justify-center text-xs text-slate-700 dark:text-slate-200">{{ currentFontSize }}</span>
      <button
        type="button"
        :class="[controlBaseClass, 'w-7 text-sm']"
        :title="t('toolbar.increaseFontSize')"
        :aria-label="t('toolbar.increaseFontSize')"
        :disabled="!editor"
        @mousedown.prevent="handleFontSize(1)"
      >
        <Plus class="h-3.5 w-3.5" />
      </button>

      <span class="mx-1 h-5 w-px flex-shrink-0 bg-slate-200 dark:bg-white/10" />

      <!-- Primary formatting (bold / italic / underline / strike, etc.) -->
      <button
        v-for="item in flatItems"
        :key="item.id"
        type="button"
        :title="item.label ?? item.id"
        :aria-label="item.label ?? item.id"
        :class="[
          'docs-editor-toolbar__button inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md p-1 transition-all disabled:opacity-40',
          isItemActive(item) ? activeClass : inactiveClass,
        ]"
        :disabled="!editor"
        @mousedown.prevent
        @click="runPluginItem(item)"
      >
        <component
          :is="resolveIcon(item.iconComponent)"
          v-if="resolveIcon(item.iconComponent)"
          class="h-[18px] w-[18px]"
        />
        <span v-else-if="item.label" class="text-xs font-medium leading-none">{{ item.label.charAt(0) }}</span>
      </button>

      <span
        v-if="colorItems.length"
        class="mx-1 h-5 w-px flex-shrink-0 bg-slate-200 dark:bg-white/10"
      />

      <!-- Text color dropdown -->
      <div v-if="textColorItem" class="toolbar-dropdown relative flex-shrink-0">
        <button
          type="button"
          :class="[controlBaseClass, 'w-8']"
          :title="textColorItem.label ?? 'Text color'"
          :aria-label="textColorItem.label ?? 'Text color'"
          :disabled="!editor"
          @mousedown.prevent
          @click.stop="toggleDropdown('textColor')"
        >
          <Palette class="h-[18px] w-[18px]" />
        </button>
        <ColorPickerDropdown
          :is-open="activeDropdown === 'textColor'"
          :active-color="currentTextColor"
          label="Custom"
          @select="applyColor('setTextColor', $event)"
          @reset="resetColor('setTextColor')"
          @close="activeDropdown = null"
        />
      </div>

      <!-- Highlight color dropdown -->
      <div v-if="highlightItem" class="toolbar-dropdown relative flex-shrink-0">
        <button
          type="button"
          :class="[controlBaseClass, 'w-8']"
          :title="highlightItem.label ?? 'Highlight'"
          :aria-label="highlightItem.label ?? 'Highlight'"
          :disabled="!editor"
          @mousedown.prevent
          @click.stop="toggleDropdown('highlight')"
        >
          <Highlighter class="h-[18px] w-[18px]" />
        </button>
        <ColorPickerDropdown
          :is-open="activeDropdown === 'highlight'"
          :active-color="currentHighlightColor"
          label="Custom"
          @select="applyColor('setHighlight', $event)"
          @reset="resetColor('setHighlight')"
          @close="activeDropdown = null"
        />
      </div>

      <span
        v-if="listItems.length || alignItems.length || insertItems.length"
        class="mx-1 h-5 w-px flex-shrink-0 bg-slate-200 dark:bg-white/10"
      />

      <!-- Lists dropdown -->
      <div v-if="listItems.length" class="toolbar-dropdown relative flex-shrink-0">
        <button
          type="button"
          :class="[controlBaseClass, 'gap-0.5 px-1.5']"
          :title="t('toolbar.lists')"
          :aria-label="t('toolbar.lists')"
          :disabled="!editor"
          @mousedown.prevent
          @click.stop="toggleDropdown('lists')"
        >
          <List class="h-[18px] w-[18px]" />
          <ChevronDown class="h-3 w-3 text-slate-400" />
        </button>
        <div
          v-if="activeDropdown === 'lists'"
          class="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-xl dark:border-slate-700 dark:bg-[#0e1525]"
        >
          <button
            v-for="item in listItems"
            :key="item.id"
            type="button"
            :class="['flex w-full items-center gap-2.5 px-3 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-white/5', isItemActive(item) ? 'text-blue-600 dark:text-blue-300' : 'text-slate-700 dark:text-slate-200']"
            :disabled="!editor"
            @mousedown.prevent
            @click="runFromDropdown(item)"
          >
            <component :is="resolveIcon(item.iconComponent)" v-if="resolveIcon(item.iconComponent)" class="h-4 w-4" />
            <span>{{ item.label ?? item.id }}</span>
          </button>
        </div>
      </div>

      <!-- Alignment dropdown -->
      <div v-if="alignItems.length" class="toolbar-dropdown relative flex-shrink-0">
        <button
          type="button"
          :class="[controlBaseClass, 'gap-0.5 px-1.5']"
          :title="t('toolbar.alignment')"
          :aria-label="t('toolbar.alignment')"
          :disabled="!editor"
          @mousedown.prevent
          @click.stop="toggleDropdown('align')"
        >
          <component :is="currentAlignIcon" class="h-[18px] w-[18px]" />
          <ChevronDown class="h-3 w-3 text-slate-400" />
        </button>
        <div
          v-if="activeDropdown === 'align'"
          class="absolute left-0 top-full z-50 mt-1 min-w-[160px] rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-xl dark:border-slate-700 dark:bg-[#0e1525]"
        >
          <button
            v-for="item in alignItems"
            :key="item.id"
            type="button"
            :class="['flex w-full items-center gap-2.5 px-3 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-white/5', isItemActive(item) ? 'text-blue-600 dark:text-blue-300' : 'text-slate-700 dark:text-slate-200']"
            :disabled="!editor"
            @mousedown.prevent
            @click="runFromDropdown(item)"
          >
            <component :is="resolveIcon(item.iconComponent)" v-if="resolveIcon(item.iconComponent)" class="h-4 w-4" />
            <span>{{ item.label ?? item.id }}</span>
          </button>
        </div>
      </div>

      <!-- Insert dropdown -->
      <div v-if="insertItems.length" class="toolbar-dropdown relative flex-shrink-0">
        <button
          type="button"
          :class="[controlBaseClass, 'gap-1 px-2 text-xs font-medium']"
          :title="t('toolbar.insert')"
          :aria-label="t('toolbar.insert')"
          :disabled="!editor"
          @mousedown.prevent
          @click.stop="toggleDropdown('insert')"
        >
          <Plus class="h-4 w-4" />
          <span class="hidden md:inline">{{ t('toolbar.insert') }}</span>
          <ChevronDown class="h-3 w-3 text-slate-400" />
        </button>
        <div
          v-if="activeDropdown === 'insert'"
          class="absolute left-0 top-full z-50 mt-1 min-w-[190px] rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-xl dark:border-slate-700 dark:bg-[#0e1525]"
        >
          <button
            v-for="item in insertItems"
            :key="item.id"
            type="button"
            :class="['flex w-full items-center gap-2.5 px-3 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-white/5', isItemActive(item) ? 'text-blue-600 dark:text-blue-300' : 'text-slate-700 dark:text-slate-200']"
            :disabled="!editor"
            @mousedown.prevent
            @click="runFromDropdown(item)"
          >
            <component :is="resolveIcon(item.iconComponent)" v-if="resolveIcon(item.iconComponent)" class="h-4 w-4" />
            <span>{{ item.label ?? item.id }}</span>
          </button>
        </div>
      </div>

      <span class="mx-1 h-5 w-px flex-shrink-0 bg-slate-200 dark:bg-white/10" />

      <!-- Sidebar toggles -->
      <button
        type="button"
        :class="['docs-editor-toolbar__control flex h-8 w-8 items-center justify-center rounded-md transition-all relative', sidebarClass('comments')]"
        :title="t('toolbar.comments')"
        :aria-label="t('toolbar.comments')"
        @click="emit('toggle-sidebar', 'comments')"
      >
        <MessageSquare class="h-[18px] w-[18px]" />
      </button>
      <button
        type="button"
        :class="['docs-editor-toolbar__control flex h-8 w-8 items-center justify-center rounded-md transition-all', sidebarClass('history')]"
        :title="t('toolbar.history')"
        :aria-label="t('toolbar.history')"
        @click="emit('toggle-sidebar', 'history')"
      >
        <History class="h-[18px] w-[18px]" />
      </button>
      <button
        v-if="hasAI"
        type="button"
        :class="['docs-editor-toolbar__control flex h-8 w-8 items-center justify-center rounded-md transition-all', sidebarClass('ai')]"
        :title="t('toolbar.ai')"
        :aria-label="t('toolbar.ai')"
        @click="emit('toggle-sidebar', 'ai')"
      >
        <Sparkles class="h-[18px] w-[18px]" />
      </button>
      <button
        type="button"
        :class="['docs-editor-toolbar__control flex h-8 w-8 items-center justify-center rounded-md transition-all', sidebarClass('toc')]"
        :title="t('toolbar.tableOfContents')"
        :aria-label="t('toolbar.tableOfContents')"
        @click="emit('toggle-sidebar', 'toc')"
      >
        <FileText class="h-[18px] w-[18px]" />
      </button>
      <button
        v-if="hasCitationPlugin"
        type="button"
        :class="['docs-editor-toolbar__control flex h-8 w-8 items-center justify-center rounded-md transition-all', sidebarClass('references')]"
        :title="t('toolbar.references')"
        :aria-label="t('toolbar.references')"
        @click="emit('toggle-sidebar', 'references')"
      >
        <BookOpen class="h-[18px] w-[18px]" />
      </button>
    </div>
  </div>
</template>

<style scoped>
</style>
