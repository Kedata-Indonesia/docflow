<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, ref, watch, onUnmounted } from 'vue'
import type { Editor } from '@tiptap/core'
import type { DocsEditorPlugin, ToolbarItem } from '@docs-editor/core'
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
  Menu,
  Undo2,
  Redo2,
  Printer,
  SpellCheck,
  Minus,
  Plus,
  ChevronDown,
} from 'lucide-vue-next'
import type { SidebarKey } from '../types.js'

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

function sidebarClass(key: SidebarKey) {
  return props.activeSidebar === key ? sidebarActiveClass : sidebarInactiveClass
}

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

function handleParagraphStyle(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (!props.editor) return
  if (value === 'paragraph') {
    (props.editor.commands as any).setParagraph()
  } else {
    const level = parseInt(value.replace('heading-', ''), 10)
    const action = `toggleHeading${level}` as string
    const fn = props.actions[action]
    if (typeof fn === 'function') {
      fn()
    } else {
      (props.editor.commands as any).toggleHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 })
    }
  }
  props.editor.commands.focus()
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

function handleFontSize(delta: number) {
  // Cosmetic only until font-size extension is installed.
  if (!props.editor) return
  const sizes = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72]
  const current = 11
  const idx = sizes.indexOf(current)
  const next = sizes[Math.min(Math.max(idx + delta, 0), sizes.length - 1)]
  // eslint-disable-next-line no-console
  console.log('font size change requested', next)
  props.editor.commands.focus()
}
</script>

<template>
  <div id="editor-toolbar-row" class="docs-editor-toolbar w-full border-b border-slate-200 bg-white py-1.5 text-slate-600 shadow-sm dark:border-slate-800 dark:bg-[#0b1120] dark:text-slate-300">
    <div class="flex min-h-9 w-full items-center gap-1 px-3 flex-nowrap overflow-hidden">
      <!-- Left: menu, undo/redo, print, zoom -->
      <button
        type="button"
        :class="[controlBaseClass, 'w-8']"
        title="Menu"
        aria-label="Menu"
        @click="emit('toggle-left-sidebar')"
      >
        <Menu class="h-[18px] w-[18px]" />
      </button>

      <button
        type="button"
        :class="[controlBaseClass, 'w-8']"
        title="Undo"
        aria-label="Undo"
        :disabled="!editor"
        @mousedown.prevent
        @click="handleUndo"
      >
        <Undo2 class="h-[18px] w-[18px]" />
      </button>

      <button
        type="button"
        :class="[controlBaseClass, 'w-8']"
        title="Redo"
        aria-label="Redo"
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
        title="Print"
        aria-label="Print"
        @mousedown.prevent
        @click="handlePrint"
      >
        <Printer class="h-[18px] w-[18px]" />
      </button>

      <button
        type="button"
        :class="[controlBaseClass, 'w-8']"
        title="Spelling"
        aria-label="Spelling"
        :disabled="!editor"
        @mousedown.prevent
      >
        <SpellCheck class="h-[18px] w-[18px]" />
      </button>

      <button
        type="button"
        :class="[controlBaseClass, 'px-2 text-xs']"
        title="Zoom"
        aria-label="Zoom"
        @mousedown.prevent
      >
        100%
      </button>

      <span class="mx-1 h-5 w-px flex-shrink-0 bg-slate-200 dark:bg-white/10" />

      <!-- Paragraph style -->
      <div class="relative flex-shrink-0">
        <select
          :value="currentParagraphStyle"
          :disabled="!editor"
          class="h-8 cursor-pointer appearance-none rounded-md border-0 bg-transparent pl-2 pr-7 text-xs font-medium text-slate-700 hover:bg-slate-100 focus:outline-none disabled:opacity-40 dark:text-slate-200 dark:hover:bg-white/5"
          aria-label="Paragraph style"
          @change="handleParagraphStyle"
        >
          <option value="paragraph">Normal text</option>
          <option value="heading-1">Heading 1</option>
          <option value="heading-2">Heading 2</option>
          <option value="heading-3">Heading 3</option>
        </select>
        <ChevronDown class="pointer-events-none absolute right-1 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      </div>

      <!-- Font family -->
      <div class="relative flex-shrink-0">
        <select
          :disabled="!editor"
          class="h-8 cursor-pointer appearance-none rounded-md border-0 bg-transparent pl-2 pr-7 text-xs font-medium text-slate-700 hover:bg-slate-100 focus:outline-none disabled:opacity-40 dark:text-slate-200 dark:hover:bg-white/5"
          aria-label="Font family"
        >
          <option value="arial">Arial</option>
          <option value="inter">Inter</option>
          <option value="serif">Serif</option>
          <option value="mono">Monospace</option>
        </select>
        <ChevronDown class="pointer-events-none absolute right-1 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      </div>

      <!-- Font size -->
      <button
        type="button"
        :class="[controlBaseClass, 'w-7 text-sm']"
        title="Decrease font size"
        aria-label="Decrease font size"
        :disabled="!editor"
        @mousedown.prevent
        @click="handleFontSize(-1)"
      >
        <Minus class="h-3.5 w-3.5" />
      </button>
      <span class="flex h-8 w-5 flex-shrink-0 select-none items-center justify-center text-xs text-slate-700 dark:text-slate-200">11</span>
      <button
        type="button"
        :class="[controlBaseClass, 'w-7 text-sm']"
        title="Increase font size"
        aria-label="Increase font size"
        :disabled="!editor"
        @mousedown.prevent
        @click="handleFontSize(1)"
      >
        <Plus class="h-3.5 w-3.5" />
      </button>

      <span class="mx-1 h-5 w-px flex-shrink-0 bg-slate-200 dark:bg-white/10" />

      <!-- Dynamic plugin formatting items -->
      <template v-for="(group, groupIndex) in toolbarGroups" :key="group.pluginId">
        <span v-if="groupIndex > 0" class="mx-1 h-5 w-px flex-shrink-0 bg-slate-200 dark:bg-white/10" />

        <button
          v-for="item in group.items"
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
      </template>

      <span class="mx-1 h-5 w-px flex-shrink-0 bg-slate-200 dark:bg-white/10" />

      <!-- Sidebar toggles -->
      <button
        type="button"
        :class="['docs-editor-toolbar__control flex h-8 w-8 items-center justify-center rounded-md transition-all relative', sidebarClass('comments')]"
        title="Comments"
        aria-label="Comments"
        @click="emit('toggle-sidebar', 'comments')"
      >
        <MessageSquare class="h-[18px] w-[18px]" />
      </button>
      <button
        type="button"
        :class="['docs-editor-toolbar__control flex h-8 w-8 items-center justify-center rounded-md transition-all', sidebarClass('history')]"
        title="History"
        aria-label="History"
        @click="emit('toggle-sidebar', 'history')"
      >
        <History class="h-[18px] w-[18px]" />
      </button>
      <button
        type="button"
        :class="['docs-editor-toolbar__control flex h-8 w-8 items-center justify-center rounded-md transition-all', sidebarClass('ai')]"
        title="AI"
        aria-label="AI"
        @click="emit('toggle-sidebar', 'ai')"
      >
        <Sparkles class="h-[18px] w-[18px]" />
      </button>
      <button
        type="button"
        :class="['docs-editor-toolbar__control flex h-8 w-8 items-center justify-center rounded-md transition-all', sidebarClass('toc')]"
        title="Table of contents"
        aria-label="Table of contents"
        @click="emit('toggle-sidebar', 'toc')"
      >
        <FileText class="h-[18px] w-[18px]" />
      </button>
    </div>
  </div>
</template>

<style scoped>
</style>
