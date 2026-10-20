<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import type { ToolbarItem } from '@kedata-indonesia/docflow-core'
import { Highlighter, Palette } from 'lucide-vue-next'
import { useLocale } from '../../composables/useLocale.js'
import ColorPickerDropdown from '../ColorPickerDropdown.vue'
import { controlBaseClass, toolbarItemLabel } from './toolbarConfig.js'
import { runToolbarAction } from './toolbarCommands.js'

const { t } = useLocale()

const props = defineProps<{
  editor?: Editor | null
  actions: Record<string, (...args: unknown[]) => boolean>
  textColorItem?: ToolbarItem
  highlightItem?: ToolbarItem
  currentTextColor?: string
  currentHighlightColor?: string
  textColorOpen: boolean
  highlightOpen: boolean
}>()

const emit = defineEmits<{
  toggle: [key: 'textColor' | 'highlight']
  close: []
}>()

function label(item?: ToolbarItem): string {
  return item ? toolbarItemLabel(t, item) : ''
}

function applyColor(action: string, color: string) {
  const editor = props.editor ?? null
  runToolbarAction(editor, props.actions, action, [color])
  editor?.commands.focus()
  emit('close')
}

function resetColor(action: string) {
  const chain = props.editor?.chain().focus() as unknown as
    | { unsetColor?: () => { run: () => boolean }; unsetHighlight?: () => { run: () => boolean } }
    | undefined
  if (!chain) {
    emit('close')
    return
  }
  if (action === 'setTextColor') {
    chain.unsetColor?.().run()
  } else if (action === 'setHighlight') {
    chain.unsetHighlight?.().run()
  }
  props.editor?.commands.focus()
  emit('close')
}
</script>

<template>
  <span
    v-if="textColorItem || highlightItem"
    class="mx-1 h-5 w-px flex-shrink-0 bg-slate-200 dark:bg-white/10"
  />

  <div v-if="textColorItem" class="toolbar-dropdown relative flex-shrink-0">
    <button
      type="button"
      :class="[controlBaseClass, 'w-8']"
      :title="label(textColorItem)"
      :aria-label="label(textColorItem)"
      :disabled="!editor"
      :aria-expanded="textColorOpen"
      aria-haspopup="menu"
      data-testid="toolbar-text-color"
      @mousedown.prevent
      @click.stop="emit('toggle', 'textColor')"
    >
      <Palette class="h-[18px] w-[18px]" />
    </button>
    <ColorPickerDropdown
      :is-open="textColorOpen"
      :active-color="currentTextColor"
      label="Custom"
      @select="applyColor('setTextColor', $event)"
      @reset="resetColor('setTextColor')"
      @close="emit('close')"
    />
  </div>

  <div v-if="highlightItem" class="toolbar-dropdown relative flex-shrink-0">
    <button
      type="button"
      :class="[controlBaseClass, 'w-8']"
      :title="label(highlightItem)"
      :aria-label="label(highlightItem)"
      :disabled="!editor"
      :aria-expanded="highlightOpen"
      aria-haspopup="menu"
      @mousedown.prevent
      @click.stop="emit('toggle', 'highlight')"
    >
      <Highlighter class="h-[18px] w-[18px]" />
    </button>
    <ColorPickerDropdown
      :is-open="highlightOpen"
      :active-color="currentHighlightColor"
      label="Custom"
      @select="applyColor('setHighlight', $event)"
      @reset="resetColor('setHighlight')"
      @close="emit('close')"
    />
  </div>
</template>
