<script setup lang="ts">
import { computed } from 'vue'
import { RefreshCw } from 'lucide-vue-next'
import type { PageSize } from '@kedata-indonesia/docflow-layout-engine'
import type { ConnectionState, SavingStatus } from '../types.js'

const props = withDefaults(
  defineProps<{
    connectionState?: ConnectionState
    savingStatus?: SavingStatus
    lastSaved?: number
    wordCount?: number
    charCount?: number
    pageCount?: number
    currentPage?: number
    pageSize?: string
    pageSizes?: PageSize[]
  }>(),
  {
    connectionState: 'connected',
    savingStatus: 'saved',
    lastSaved: undefined,
    wordCount: 0,
    charCount: 0,
    pageCount: 1,
    currentPage: 1,
    pageSize: 'a4',
    pageSizes: () => [],
  },
)

const emit = defineEmits<{
  'update:pageSize': [pageSize: string]
}>()

const formattedLastSaved = computed(() => {
  if (!props.lastSaved) return 'Never'
  return new Date(props.lastSaved).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
})

const currentSizeName = computed(() => {
  return props.pageSizes?.find((s) => s.id === props.pageSize)?.name ?? props.pageSize.toUpperCase()
})
</script>

<template>
  <footer id="editor-footer-row" class="flex h-9 flex-shrink-0 items-center justify-between border-t border-slate-200 bg-white px-4 font-sans text-[11px] text-slate-400 dark:border-slate-800 dark:bg-[#0b1120]">
    <div class="flex items-center gap-2">
      <span class="flex items-center gap-1 font-bold">
        <span v-if="connectionState === 'connected'" class="relative mr-1 flex h-2 w-2">
          <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span class="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span v-else class="relative mr-1 flex h-2 w-2">
          <span class="h-2 w-2 animate-spin rounded-full border border-amber-500 border-t-transparent" />
        </span>

        <span
          v-if="connectionState === 'connected'"
          class="font-mono text-[10px] uppercase tracking-wide text-emerald-600 dark:text-cyan-400"
        >
          Live Sync Active
        </span>
        <span v-else class="font-mono text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-500">
          Connecting...
        </span>
      </span>

      <span class="text-slate-200 dark:text-white/10">|</span>

      <span class="flex items-center gap-1.5 font-sans text-[11px] font-medium text-slate-500 dark:text-slate-400">
        <RefreshCw class="h-3 w-3" :class="savingStatus === 'saving' ? 'animate-spin text-cyan-500' : 'text-emerald-500'" />
        <span v-if="savingStatus === 'saving'" class="animate-pulse font-semibold text-cyan-600 dark:text-cyan-400">
          Saving changes...
        </span>
        <span v-else-if="savingStatus === 'offline'" class="font-semibold text-amber-600 dark:text-amber-500">
          Offline
        </span>
        <span v-else class="flex items-center gap-1">
          <span>Last saved at</span>
          <strong class="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-700 dark:bg-white/5 dark:text-slate-300">
            {{ formattedLastSaved }}
          </strong>
        </span>
      </span>
    </div>

    <div class="flex items-center gap-3 font-semibold text-slate-400 dark:text-slate-500">
      <select
        :value="pageSize"
        :title="currentSizeName"
        class="h-6 cursor-pointer rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-600 outline-none hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
        aria-label="Page size"
        @change="emit('update:pageSize', ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="size in pageSizes" :key="size.id" :value="size.id">{{ size.name }}</option>
      </select>

      <span class="text-slate-200 dark:text-white/10">•</span>

      <span>
        Page
        <strong class="font-mono text-slate-600 dark:text-slate-300">{{ currentPage }}</strong>
        of
        <strong class="font-mono text-slate-600 dark:text-slate-300">{{ pageCount }}</strong>
      </span>
      <span class="text-slate-200 dark:text-white/10">•</span>
      <span>
        <strong class="font-mono text-slate-600 dark:text-slate-300">{{ wordCount }}</strong> words
      </span>
      <span class="text-slate-200 dark:text-white/10">•</span>
      <span>
        <strong class="font-mono text-slate-600 dark:text-slate-300">{{ charCount }}</strong> characters
      </span>
    </div>
  </footer>
</template>
