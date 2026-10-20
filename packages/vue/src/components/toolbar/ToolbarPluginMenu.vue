<script setup lang="ts">
import type { Component } from 'vue'
import type { Editor } from '@tiptap/core'
import type { ToolbarItem } from '@kedata-indonesia/docflow-core'
import { ChevronDown } from 'lucide-vue-next'
import { useLocale } from '../../composables/useLocale.js'
import { controlBaseClass, resolveIcon, toolbarItemLabel } from './toolbarConfig.js'
import { isToolbarItemActive } from './toolbarCommands.js'

const { t } = useLocale()

const props = defineProps<{
  editor?: Editor | null
  items: ToolbarItem[]
  open: boolean
  title: string
  triggerIcon?: Component | null
  triggerIconClass?: string
  triggerClass?: string
  panelClass?: string
  showLabel?: boolean
  label?: string
  selectionTick: number
}>()

const emit = defineEmits<{
  toggle: []
  run: [item: ToolbarItem]
}>()

function itemLabel(item: ToolbarItem): string {
  return toolbarItemLabel(t, item)
}

function isActive(item: ToolbarItem): boolean {
  void props.selectionTick
  return isToolbarItemActive(props.editor ?? null, item)
}
</script>

<template>
  <div class="toolbar-dropdown relative flex-shrink-0">
    <button
      type="button"
      :class="[controlBaseClass, triggerClass]"
      :title="title"
      :aria-label="title"
      :disabled="!editor"
      :aria-expanded="open"
      aria-haspopup="menu"
      @mousedown.prevent
      @click.stop="emit('toggle')"
    >
      <component :is="triggerIcon" v-if="triggerIcon" :class="triggerIconClass ?? 'h-[18px] w-[18px]'" />
      <span v-if="showLabel" class="hidden md:inline">{{ label }}</span>
      <ChevronDown class="h-3 w-3 text-slate-400" />
    </button>
    <div
      v-if="open"
      :class="[
        'absolute left-0 top-full z-50 mt-1 rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-xl dark:border-slate-700 dark:bg-[#0e1525]',
        panelClass,
      ]"
    >
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        :class="['flex w-full items-center gap-2.5 px-3 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-white/5', isActive(item) ? 'text-blue-600 dark:text-blue-300' : 'text-slate-700 dark:text-slate-200']"
        :disabled="!editor"
        @mousedown.prevent
        @click="emit('run', item)"
      >
        <component :is="resolveIcon(item.iconComponent)" v-if="resolveIcon(item.iconComponent)" class="h-4 w-4" />
        <span>{{ itemLabel(item) }}</span>
      </button>
    </div>
  </div>
</template>
