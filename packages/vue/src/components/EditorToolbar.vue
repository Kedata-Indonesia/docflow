<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Editor } from '@tiptap/core'
import type { DocsEditorPlugin, ToolbarItem } from '@kedata-indonesia/docflow-core'
import { List, Plus } from 'lucide-vue-next'
import type { SidebarKey } from '../types.js'
import { useLocale } from '../composables/useLocale.js'
import { readEditorContext } from '../composables/editorContext.js'
import { useToolbarSelection } from '../composables/useToolbarSelection.js'
import { useToolbarDropdowns } from '../composables/useToolbarDropdowns.js'
import { useToolbarItems } from '../composables/useToolbarItems.js'
import { toolbarCommands } from './toolbar/toolbarCommands.js'
import { TOOLBAR_DIVIDER } from '../styles/classes.js'
import ToolbarDocControls from './toolbar/ToolbarDocControls.vue'
import ToolbarZoom from './toolbar/ToolbarZoom.vue'
import ToolbarIndent from './toolbar/ToolbarIndent.vue'
import ToolbarParagraphStyle from './toolbar/ToolbarParagraphStyle.vue'
import ToolbarFontFamily from './toolbar/ToolbarFontFamily.vue'
import ToolbarFontSize from './toolbar/ToolbarFontSize.vue'
import ToolbarInlineFormat from './toolbar/ToolbarInlineFormat.vue'
import ToolbarColorControls from './toolbar/ToolbarColorControls.vue'
import ToolbarCodeLanguage from './toolbar/ToolbarCodeLanguage.vue'
import ToolbarPluginMenu from './toolbar/ToolbarPluginMenu.vue'
import ToolbarSidebarToggles from './toolbar/ToolbarSidebarToggles.vue'
import TableSizePicker from './TableSizePicker.vue'

const { t } = useLocale()

const props = defineProps<{
  actions: Record<string, (...args: unknown[]) => boolean>
  plugins?: DocsEditorPlugin[]
  editor?: Editor | null
  activeSidebar?: SidebarKey | null
  /** Issue #144 — page-surface zoom in percent (default 100). */
  zoom?: number
  /** Virtual pages are not zoom-aware; the control is disabled with a reason. */
  zoomDisabled?: boolean
}>()

const emit = defineEmits<{
  'toggle-sidebar': [key: SidebarKey]
  print: []
  undo: []
  redo: []
  'toggle-left-sidebar': []
  'update:zoom': [zoom: number]
}>()

const {
  selectionTick,
  currentTextColor,
  currentHighlightColor,
  currentAlignIcon,
  currentParagraphStyle,
  currentFont,
  currentFontLabel,
} = useToolbarSelection(() => props.editor ?? null)

const { activeDropdown, toggleDropdown, closeAll } = useToolbarDropdowns()

const {
  alignItems,
  listItems,
  insertItems,
  flatItems,
  textColorItem,
  highlightItem,
  runPluginItem,
  runFromDropdown,
} = useToolbarItems(
  () => props.plugins,
  () => props.actions,
  () => props.editor ?? null,
  closeAll,
)

// The references sidebar is only meaningful when the citation plugin is loaded.
const hasCitationPlugin = computed(() => props.plugins?.some((p) => p.id === 'citation') ?? false)

// The AI sidebar is only meaningful when the host injects an aiStream port.
const hasAI = computed(() => Boolean(readEditorContext(props.editor ?? null)?.aiStream))

function applyParagraphStyle(value: string) {
  const editor = props.editor
  if (editor) {
    const commands = toolbarCommands(editor)
    if (value === 'paragraph') {
      commands.setParagraph()
    } else {
      const level = parseInt(value.replace('heading-', ''), 10)
      const fn = props.actions[`toggleHeading${level}`]
      if (typeof fn === 'function') {
        fn()
      } else {
        commands.toggleHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 })
      }
    }
    editor.commands.focus()
  }
  closeAll()
}

function applyFont(value: string) {
  props.editor?.commands.setFontFamily(value)
  closeAll()
  props.editor?.commands.focus()
}

function applyZoom(value: number) {
  emit('update:zoom', value)
  closeAll()
}

const showTableSizePicker = ref(false)

/**
 * Insert-table goes through a size picker instead of the fixed 3×3 action
 * (issue #146). Every other insert-menu item still runs normally.
 */
function handleRunFromDropdown(item: ToolbarItem): void {
  if (item.action === 'insertTable') {
    showTableSizePicker.value = true
    closeAll()
    return
  }
  runFromDropdown(item)
}

function applyTableSize(size: { rows: number; cols: number }): void {
  const editor = props.editor
  if (!editor) return
  const attributes = { rows: size.rows, cols: size.cols, withHeaderRow: true }
  const fn = props.actions['insertTable']
  if (typeof fn === 'function') {
    fn(attributes)
  } else {
    const chain = editor.chain().focus() as unknown as {
      insertTable?: (attrs: typeof attributes) => { run: () => boolean }
    }
    chain.insertTable?.(attributes).run()
  }
  showTableSizePicker.value = false
  editor.commands.focus()
}
</script>

<template>
  <div
    id="editor-toolbar-row"
    class="docs-editor-toolbar w-full border-b border-slate-200 bg-white py-1.5 text-slate-600 shadow-sm dark:border-slate-800 dark:bg-[#0b1120] dark:text-slate-300"
  >
    <div class="flex min-h-9 w-full items-center gap-1 px-3 flex-nowrap">
      <ToolbarDocControls
        :editor="editor"
        @undo="emit('undo')"
        @redo="emit('redo')"
        @print="emit('print')"
      />

      <ToolbarZoom
        :zoom="zoom ?? 100"
        :open="activeDropdown === 'zoom'"
        :disabled="zoomDisabled"
        @toggle="toggleDropdown('zoom')"
        @apply="applyZoom"
      />

      <span :class="TOOLBAR_DIVIDER" />

      <ToolbarParagraphStyle
        :editor="editor"
        :open="activeDropdown === 'heading'"
        :current-style="currentParagraphStyle"
        @toggle="toggleDropdown('heading')"
        @apply="applyParagraphStyle"
      />

      <ToolbarFontFamily
        :editor="editor"
        :open="activeDropdown === 'font'"
        :current-font="currentFont"
        :current-label="currentFontLabel"
        @toggle="toggleDropdown('font')"
        @apply="applyFont"
      />

      <ToolbarFontSize :editor="editor" :selection-tick="selectionTick" />

      <span :class="TOOLBAR_DIVIDER" />

      <ToolbarInlineFormat
        :editor="editor"
        :items="flatItems"
        :selection-tick="selectionTick"
        @run="runPluginItem"
      />

      <ToolbarColorControls
        :editor="editor"
        :actions="actions"
        :text-color-item="textColorItem"
        :highlight-item="highlightItem"
        :current-text-color="currentTextColor"
        :current-highlight-color="currentHighlightColor"
        :text-color-open="activeDropdown === 'textColor'"
        :highlight-open="activeDropdown === 'highlight'"
        @toggle="toggleDropdown"
        @close="closeAll"
      />

      <ToolbarCodeLanguage
        :editor="editor"
        :open="activeDropdown === 'codeLanguage'"
        :selection-tick="selectionTick"
        @toggle="toggleDropdown('codeLanguage')"
        @close="closeAll"
      />

      <span
        v-if="listItems.length || alignItems.length || insertItems.length"
        :class="TOOLBAR_DIVIDER"
      />

      <ToolbarPluginMenu
        v-if="listItems.length"
        :editor="editor"
        :items="listItems"
        :open="activeDropdown === 'lists'"
        :title="t('toolbar.lists')"
        :trigger-icon="List"
        trigger-class="gap-0.5 px-1.5"
        panel-class="min-w-[180px]"
        :selection-tick="selectionTick"
        @toggle="toggleDropdown('lists')"
        @run="runFromDropdown"
      />

      <ToolbarPluginMenu
        v-if="alignItems.length"
        :editor="editor"
        :items="alignItems"
        :open="activeDropdown === 'align'"
        :title="t('toolbar.alignment')"
        :trigger-icon="currentAlignIcon"
        trigger-class="gap-0.5 px-1.5"
        panel-class="min-w-[160px]"
        :selection-tick="selectionTick"
        @toggle="toggleDropdown('align')"
        @run="runFromDropdown"
      />

      <ToolbarIndent :editor="editor" :selection-tick="selectionTick" />

      <ToolbarPluginMenu
        v-if="insertItems.length"
        :editor="editor"
        :items="insertItems"
        :open="activeDropdown === 'insert'"
        :title="t('toolbar.insert')"
        :trigger-icon="Plus"
        trigger-icon-class="h-4 w-4"
        :show-label="true"
        :label="t('toolbar.insert')"
        trigger-class="gap-1 px-2 text-xs font-medium"
        panel-class="min-w-[190px]"
        :selection-tick="selectionTick"
        @toggle="toggleDropdown('insert')"
        @run="handleRunFromDropdown"
      />

      <span :class="TOOLBAR_DIVIDER" />

      <ToolbarSidebarToggles
        :active-sidebar="activeSidebar"
        :has-ai="hasAI"
        :has-citation-plugin="hasCitationPlugin"
        @toggle-sidebar="emit('toggle-sidebar', $event)"
      />
    </div>

    <TableSizePicker
      :is-open="showTableSizePicker"
      @select="applyTableSize"
      @close="showTableSizePicker = false"
    />
  </div>
</template>

<style scoped>
</style>
