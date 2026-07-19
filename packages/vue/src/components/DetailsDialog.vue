<script setup lang="ts">
import { X, FileText, User, Calendar, Clock, Hash, Folder } from 'lucide-vue-next'
import type { DocumentMeta } from '../types.js'
import { useLocale } from '../composables/useLocale.js'

const { t } = useLocale()

defineProps<{
  isOpen: boolean
  meta?: DocumentMeta
}>()

const emit = defineEmits<{
  close: []
}>()

function formatDate(ts: number): string {
  if (!ts) return '-'
  return new Date(ts).toLocaleString()
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div class="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#0e1525]">
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100">
          {{ t('editor.details.title') }}
        </h2>
        <button
          type="button"
          class="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/5 dark:hover:text-slate-300"
          @click="emit('close')"
        >
          <X class="h-4 w-4" />
        </button>
      </div>

      <div v-if="meta" class="space-y-4">
        <!-- Title -->
        <div class="flex items-start gap-3">
          <div class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
            <FileText class="h-4 w-4" />
          </div>
          <div>
            <label class="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {{ t('editor.details.titleLabel') }}
            </label>
            <p class="text-sm font-medium text-slate-800 dark:text-slate-200">
              {{ meta.title }}
            </p>
          </div>
        </div>

        <!-- Owner -->
        <div class="flex items-start gap-3">
          <div class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <User class="h-4 w-4" />
          </div>
          <div>
            <label class="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {{ t('editor.details.owner') }}
            </label>
            <p class="text-sm font-medium text-slate-800 dark:text-slate-200">
              {{ meta.owner.name }}
            </p>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              {{ meta.owner.email }}
            </p>
          </div>
        </div>

        <!-- Folder -->
        <div class="flex items-start gap-3">
          <div class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Folder class="h-4 w-4" />
          </div>
          <div>
            <label class="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {{ t('editor.details.location') }}
            </label>
            <p class="text-sm font-medium text-slate-800 dark:text-slate-200">
              {{ meta.folderName || t('editor.details.noFolder') }}
            </p>
          </div>
        </div>

        <!-- Dates -->
        <div class="grid grid-cols-2 gap-3">
          <div class="flex items-start gap-3">
            <div class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Calendar class="h-4 w-4" />
            </div>
            <div>
              <label class="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {{ t('editor.details.created') }}
              </label>
              <p class="text-xs font-medium text-slate-800 dark:text-slate-200">
                {{ formatDate(meta.createdAt) }}
              </p>
            </div>
          </div>

          <div class="flex items-start gap-3">
            <div class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Clock class="h-4 w-4" />
            </div>
            <div>
              <label class="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {{ t('editor.details.modified') }}
              </label>
              <p class="text-xs font-medium text-slate-800 dark:text-slate-200">
                {{ formatDate(meta.updatedAt) }}
              </p>
            </div>
          </div>
        </div>

        <!-- Statistics -->
        <div class="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700/50 dark:bg-white/5">
          <div class="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            <Hash class="h-3.5 w-3.5" />
            {{ t('editor.details.statistics') }}
          </div>
          <div class="grid grid-cols-3 gap-3 text-center">
            <div>
              <p class="text-lg font-bold text-slate-800 dark:text-slate-100">{{ meta.wordCount }}</p>
              <p class="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{{ t('editor.details.words') }}</p>
            </div>
            <div>
              <p class="text-lg font-bold text-slate-800 dark:text-slate-100">{{ meta.charCount }}</p>
              <p class="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{{ t('editor.details.characters') }}</p>
            </div>
            <div>
              <p class="text-lg font-bold text-slate-800 dark:text-slate-100">{{ meta.pageCount }}</p>
              <p class="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{{ t('editor.details.pages') }}</p>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
        {{ t('editor.details.loading') }}
      </div>
    </div>
  </div>
</template>
