<script setup lang="ts">
import { Pencil, Quote, Trash2 } from 'lucide-vue-next'
import type { CslItemData } from '@kedata-indonesia/docflow-core'
import { useLocale } from '../../../composables/useLocale.js'
import { authorLabel, typeLabel, yearOf } from './format.js'

/** One row in the source list. Purely presentational — every action is an emit. */
defineProps<{
  source: CslItemData
  /** Highlight "Cite" while an insert-citation request is pending. */
  pickerMode?: boolean
}>()

const emit = defineEmits<{
  insert: [id: string]
  edit: [source: CslItemData]
  remove: [source: CslItemData]
}>()

const { t } = useLocale()
</script>

<template>
  <div class="group rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 transition-all hover:border-slate-300 dark:border-white/10 dark:bg-white/[0.02] dark:hover:border-white/20">
    <div class="min-w-0 flex-1">
      <p class="truncate text-xs font-semibold text-slate-800 dark:text-slate-200" :title="source.title">
        {{ source.title }}
      </p>
      <p class="mt-0.5 truncate text-[10px] text-slate-500 dark:text-slate-400">
        {{ authorLabel(source, t) }}<span v-if="yearOf(source)"> ({{ yearOf(source) }})</span>
        <span v-if="source['container-title']"> · {{ source['container-title'] }}</span>
        <span v-else-if="source.publisher"> · {{ source.publisher }}</span>
      </p>
      <span class="mt-1.5 inline-block rounded bg-slate-200/70 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide text-slate-500 dark:bg-white/10 dark:text-slate-400">
        {{ typeLabel(source.type, t) }}
      </span>
    </div>
    <div class="mt-2.5 flex items-center gap-1.5">
      <button
        type="button"
        class="flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold transition-colors"
        :class="pickerMode
          ? 'bg-blue-600 text-white hover:bg-blue-700'
          : 'bg-slate-200/80 text-slate-700 hover:bg-blue-600 hover:text-white dark:bg-white/10 dark:text-slate-300 dark:hover:bg-blue-600'"
        @click="emit('insert', source.id)"
      >
        <Quote class="h-3 w-3" /> {{ t('sidebars.references.cite') }}
      </button>
      <button
        type="button"
        class="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-white"
        :title="t('sidebars.references.edit')"
        :aria-label="t('sidebars.references.edit')"
        @click="emit('edit', source)"
      >
        <Pencil class="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        class="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
        :title="t('sidebars.references.delete')"
        :aria-label="t('sidebars.references.delete')"
        @click="emit('remove', source)"
      >
        <Trash2 class="h-3.5 w-3.5" />
      </button>
    </div>
  </div>
</template>
