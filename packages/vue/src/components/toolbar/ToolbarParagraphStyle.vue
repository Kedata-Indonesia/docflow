<script setup lang="ts">
import { computed } from 'vue'
import type { Editor } from '@tiptap/core'
import { ChevronDown } from 'lucide-vue-next'
import { useLocale } from '../../composables/useLocale.js'
import { controlBaseClass } from './toolbarConfig.js'

const { t } = useLocale()

const props = defineProps<{
  editor?: Editor | null
  open: boolean
  currentStyle: string
}>()

const emit = defineEmits<{
  toggle: []
  apply: [value: string]
}>()

const options = computed(() => [
  { value: 'paragraph', label: t('toolbar.normalText') },
  { value: 'heading-1', label: t('header.heading1') },
  { value: 'heading-2', label: t('header.heading2') },
  { value: 'heading-3', label: t('header.heading3') },
  { value: 'heading-4', label: t('header.heading4') },
  { value: 'heading-5', label: t('header.heading5') },
  { value: 'heading-6', label: t('header.heading6') },
])

const currentLabel = computed(
  () => options.value.find((option) => option.value === props.currentStyle)?.label ?? t('toolbar.normalText'),
)
</script>

<template>
  <div class="toolbar-dropdown relative flex-shrink-0">
    <button
      type="button"
      :class="[controlBaseClass, 'w-[116px] justify-between gap-1 px-2 text-xs font-medium']"
      :title="t('toolbar.paragraphStyle')"
      :aria-label="t('toolbar.paragraphStyle')"
      :disabled="!editor"
      :aria-expanded="open"
      aria-haspopup="menu"
      data-testid="toolbar-heading"
      @mousedown.prevent
      @click.stop="emit('toggle')"
    >
      <span class="truncate">{{ currentLabel }}</span>
      <ChevronDown class="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
    </button>
    <div
      v-if="open"
      class="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-xl dark:border-slate-700 dark:bg-[#0e1525]"
      data-testid="toolbar-heading-menu"
    >
      <button
        v-for="opt in options"
        :key="opt.value"
        type="button"
        :class="['flex w-full items-center px-3 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-white/5', currentStyle === opt.value ? 'text-blue-600 dark:text-blue-300' : 'text-slate-700 dark:text-slate-200']"
        :disabled="!editor"
        @mousedown.prevent
        @click="emit('apply', opt.value)"
      >
        {{ opt.label }}
      </button>
    </div>
  </div>
</template>
