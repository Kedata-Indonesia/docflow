<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import type { ToolbarItem } from '@kedata-indonesia/docflow-core'
import { useLocale } from '../../composables/useLocale.js'
import {
  activeClass,
  inactiveClass,
  resolveIcon,
  toolbarItemLabel,
} from './toolbarConfig.js'
import { isToolbarItemActive } from './toolbarCommands.js'

const { t } = useLocale()

const props = defineProps<{
  editor?: Editor | null
  items: ToolbarItem[]
  selectionTick: number
}>()

const emit = defineEmits<{
  run: [item: ToolbarItem]
}>()

function label(item: ToolbarItem): string {
  return toolbarItemLabel(t, item)
}

function isActive(item: ToolbarItem): boolean {
  void props.selectionTick
  return isToolbarItemActive(props.editor ?? null, item)
}
</script>

<template>
  <button
    v-for="item in items"
    :key="item.id"
    type="button"
    :title="label(item)"
    :aria-label="label(item)"
    :class="[
      'docs-editor-toolbar__button inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md p-1 transition-all disabled:opacity-40',
      isActive(item) ? activeClass : inactiveClass,
    ]"
    :disabled="!editor"
    :aria-pressed="isActive(item)"
    @mousedown.prevent
    @click="emit('run', item)"
  >
    <component
      :is="resolveIcon(item.iconComponent)"
      v-if="resolveIcon(item.iconComponent)"
      class="h-[18px] w-[18px]"
    />
    <span v-else-if="label(item)" class="text-xs font-medium leading-none">{{ label(item).charAt(0) }}</span>
  </button>
</template>
