<script setup lang="ts">
import { computed } from 'vue'
import type { Editor } from '@tiptap/core'
import type { DocsEditorPlugin } from '@kedata-indonesia/docflow-core'
import { List, Plus } from 'lucide-vue-next'
import type { SidebarKey } from '../types.js'
import { useLocale } from '../composables/useLocale.js'
import { readEditorContext } from '../composables/editorContext.js'
import { useToolbarSelection } from '../composables/useToolbarSelection.js'
import { useToolbarDropdowns } from '../composables/useToolbarDropdowns.js'
import { useToolbarItems } from '../composables/useToolbarItems.js'
import { toolbarCommands } from './toolbar/toolbarCommands.js'
import ToolbarDocControls from './toolbar/ToolbarDocControls.vue'
import ToolbarParagraphStyle from './toolbar/ToolbarParagraphStyle.vue'
import ToolbarFontFamily from './toolbar/ToolbarFontFamily.vue'
import ToolbarFontSize from './toolbar/ToolbarFontSize.vue'
import ToolbarInlineFormat from './toolbar/ToolbarInlineFormat.vue'
import ToolbarColorControls from './toolbar/ToolbarColorControls.vue'
import ToolbarPluginMenu from './toolbar/ToolbarPluginMenu.vue'
import ToolbarSidebarToggles from './toolbar/ToolbarSidebarToggles.vue'

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

      <span class="mx-1 h-5 w-px flex-shrink-0 bg-slate-200 dark:bg-white/10" />

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

      <span class="mx-1 h-5 w-px flex-shrink-0 bg-slate-200 dark:bg-white/10" />

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

      <span
        v-if="listItems.length || alignItems.length || insertItems.length"
        class="mx-1 h-5 w-px flex-shrink-0 bg-slate-200 dark:bg-white/10"
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
        @run="runFromDropdown"
      />

      <span class="mx-1 h-5 w-px flex-shrink-0 bg-slate-200 dark:bg-white/10" />

      <ToolbarSidebarToggles
        :active-sidebar="activeSidebar"
        :has-ai="hasAI"
        :has-citation-plugin="hasCitationPlugin"
        @toggle-sidebar="emit('toggle-sidebar', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
</style>
