<script setup lang="ts">
import { computed } from 'vue'
import { FileIcon, RotateCcw, Trash2 } from 'lucide-vue-next'
import type { DocumentItem } from '../types.js'
import { useLocale } from '@kedata-indonesia/docflow-vue'

const { t } = useLocale()

const props = defineProps<{
  documents: DocumentItem[]
}>()

const emit = defineEmits<{
  restore: [id: string]
  deleteForever: [id: string]
  back: []
}>()

const sorted = computed(() => {
  return [...props.documents].sort((a, b) => b.updatedAt - a.updatedAt)
})

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString()
}
</script>

<template>
  <div class="flex h-full w-full flex-col bg-slate-50/50 dark:bg-[#02040a]/50">
    <header class="flex items-center gap-3 border-b border-slate-200/60 bg-white/80 px-6 py-4 dark:border-white/5 dark:bg-[#0a0f1e]/80">
      <button
        type="button"
        class="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
        @click="emit('back')"
      >
        {{ t('common.back') }}
      </button>
      <h2 class="text-base font-bold text-slate-800 dark:text-slate-100">
        {{ t('dashboard.trash') }}
      </h2>
    </header>

    <main class="flex-1 overflow-y-auto p-6">
      <div
        v-if="sorted.length === 0"
        class="mt-12 text-center"
      >
        <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-200/50 text-slate-400 dark:bg-white/5">
          <Trash2 class="h-6 w-6" />
        </div>
        <h4 class="mb-1 font-bold text-slate-800 dark:text-slate-100">{{ t('dashboard.trashEmpty') }}</h4>
        <p class="text-xs text-slate-400 dark:text-slate-500">{{ t('dashboard.trashEmptyDescription') }}</p>
      </div>

      <div
        v-else
        class="overflow-hidden rounded-2xl border border-slate-200/60 bg-white/80 shadow-lg backdrop-blur-md dark:border-white/5 dark:bg-[#0a0f1e]/40"
      >
        <table class="w-full border-collapse text-left text-sm text-slate-700 dark:text-slate-200">
          <thead>
            <tr class="border-b border-slate-100 bg-slate-50 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:border-white/5 dark:bg-[#0a0f1e]/80 font-mono">
              <th class="px-5 py-4">{{ t('dashboard.documentTitle') }}</th>
              <th class="hidden px-5 py-4 sm:table-cell">{{ t('dashboard.trashedAt') }}</th>
              <th class="px-5 py-4 text-right">{{ t('dashboard.actions') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-white/5">
            <tr
              v-for="doc in sorted"
              :key="doc.id"
              class="transition-colors hover:bg-slate-50/50 dark:hover:bg-white/5"
            >
              <td class="px-5 py-4">
                <div class="flex items-center gap-3">
                  <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                    <FileIcon class="h-4 w-4" />
                  </div>
                  <span class="font-medium text-slate-800 dark:text-slate-100">{{ doc.title }}</span>
                </div>
              </td>
              <td class="hidden px-5 py-4 text-xs text-slate-500 dark:text-slate-400 sm:table-cell">
                {{ doc.deletedAt ? formatDate(doc.deletedAt.getTime()) : '' }}
              </td>
              <td class="px-5 py-4 text-right">
                <div class="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    class="rounded-lg px-3 py-1.5 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-50 dark:text-cyan-400 dark:hover:bg-cyan-950/30"
                    @click="emit('restore', doc.id)"
                  >
                    <span class="flex items-center gap-1.5">
                      <RotateCcw class="h-3.5 w-3.5" />
                      {{ t('common.restore') }}
                    </span>
                  </button>
                  <button
                    type="button"
                    class="rounded-lg px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                    @click="emit('deleteForever', doc.id)"
                  >
                    <span class="flex items-center gap-1.5">
                      <Trash2 class="h-3.5 w-3.5" />
                      {{ t('common.deleteForever') }}
                    </span>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>
  </div>
</template>
