<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import { ChevronDown } from 'lucide-vue-next'
import { useLocale } from '../../composables/useLocale.js'
import { controlBaseClass, FONT_OPTIONS } from './toolbarConfig.js'

const { t } = useLocale()

defineProps<{
  editor?: Editor | null
  open: boolean
  currentFont: string
  currentLabel: string
}>()

const emit = defineEmits<{
  toggle: []
  apply: [value: string]
}>()
</script>

<template>
  <div class="toolbar-dropdown relative flex-shrink-0">
    <button
      type="button"
      :class="[controlBaseClass, 'w-[100px] justify-between gap-1 px-2 text-xs font-medium']"
      :title="t('toolbar.fontFamily')"
      :aria-label="t('toolbar.fontFamily')"
      :disabled="!editor"
      :aria-expanded="open"
      aria-haspopup="menu"
      @mousedown.prevent
      @click.stop="emit('toggle')"
    >
      <span class="truncate">{{ currentLabel }}</span>
      <ChevronDown class="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
    </button>
    <div
      v-if="open"
      class="absolute left-0 top-full z-50 mt-1 min-w-[160px] rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-xl dark:border-slate-700 dark:bg-[#0e1525]"
    >
      <button
        v-for="opt in FONT_OPTIONS"
        :key="opt.value"
        type="button"
        :class="['flex w-full items-center px-3 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-white/5', currentFont === opt.value ? 'text-blue-600 dark:text-blue-300' : 'text-slate-700 dark:text-slate-200']"
        @mousedown.prevent
        @click="emit('apply', opt.value)"
      >
        {{ opt.label }}
      </button>
    </div>
  </div>
</template>
