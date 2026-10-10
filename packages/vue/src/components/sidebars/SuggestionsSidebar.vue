<script setup lang="ts">
import { computed } from 'vue'
import { Check, X, CheckCheck, XCircle, GitPullRequest } from 'lucide-vue-next'
import type { SuggestionSummary } from '../../types.js'
import { useLocale } from '../../composables/useLocale.js'

/**
 * Track-changes review panel (issues #27/#28, P2). Lists pending suggestions and
 * lets a reviewer accept/reject them individually or all at once. Presentational:
 * the parent owns the editor; this only emits intent.
 */
const props = withDefaults(
  defineProps<{
    suggestions: SuggestionSummary[]
    /** Host gate — when false the accept/reject controls are hidden (viewer). */
    canReview?: boolean
  }>(),
  { canReview: true },
)

const emit = defineEmits<{
  accept: [id: string]
  reject: [id: string]
  'accept-all': []
  'reject-all': []
  close: []
}>()

const { t } = useLocale()

const count = computed(() => props.suggestions.length)

/** Badge text: Insert / Delete / "Format: bold". */
const suggestionLabel = (suggestion: SuggestionSummary): string => {
  if (suggestion.type === 'insert') return t('sidebars.suggestions.insert')
  if (suggestion.type === 'delete') return t('sidebars.suggestions.delete')
  const name = suggestion.format ?? ''
  return `${t('sidebars.suggestions.format')}: ${name}`
}
</script>

<template>
  <aside class="suggestions-sidebar flex h-full w-80 flex-shrink-0 flex-col border-l border-slate-200 bg-white/80 text-slate-800 backdrop-blur-xl animate-fadeIn dark:border-white/5 dark:bg-[#0a0f1e]/85 dark:text-slate-100">
    <header class="flex items-center gap-2 border-b border-slate-200/70 px-4 py-3 dark:border-white/5">
      <GitPullRequest class="h-4 w-4 text-emerald-500" />
      <div class="min-w-0 flex-1">
        <p class="truncate text-xs font-bold">{{ t('sidebars.suggestions.title') }}</p>
        <p class="truncate text-[10px] text-slate-400 dark:text-slate-500">
          {{ t('sidebars.suggestions.subtitle').replace('{count}', String(count)) }}
        </p>
      </div>
      <button
        type="button"
        class="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/5 dark:hover:text-slate-200"
        :title="t('sidebars.suggestions.close')"
        :aria-label="t('sidebars.suggestions.close')"
        @click="emit('close')"
      >
        <X class="h-4 w-4" />
      </button>
    </header>

    <div v-if="canReview && count > 0" class="flex gap-2 border-b border-slate-200/70 px-4 py-2 dark:border-white/5">
      <button
        type="button"
        class="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-emerald-600 px-2 py-1.5 text-[11px] font-semibold text-white transition hover:bg-emerald-500"
        @click="emit('accept-all')"
      >
        <CheckCheck class="h-3.5 w-3.5" /> {{ t('sidebars.suggestions.acceptAll') }}
      </button>
      <button
        type="button"
        class="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-slate-300 px-2 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
        @click="emit('reject-all')"
      >
        <XCircle class="h-3.5 w-3.5" /> {{ t('sidebars.suggestions.rejectAll') }}
      </button>
    </div>

    <ol class="flex-1 space-y-2 overflow-y-auto px-4 py-3">
      <li
        v-for="suggestion in suggestions"
        :key="suggestion.id"
        class="rounded-xl border border-slate-200/80 bg-white/70 p-3 shadow-sm dark:border-white/5 dark:bg-white/[0.03]"
      >
        <div class="flex items-center gap-2">
          <span
            class="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
            :class="suggestion.type === 'insert'
              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
              : suggestion.type === 'delete'
                ? 'bg-rose-500/15 text-rose-600 dark:text-rose-300'
                : 'bg-sky-500/15 text-sky-700 dark:text-sky-300'"
          >
            {{ suggestionLabel(suggestion) }}
          </span>
          <span class="truncate text-[10px] text-slate-500 dark:text-slate-400">
            {{ suggestion.authorName ?? t('sidebars.references.anonymous') }}
          </span>
        </div>
        <div v-if="canReview" class="mt-2 flex gap-2">
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-emerald-500"
            @click="emit('accept', suggestion.id)"
          >
            <Check class="h-3 w-3" /> {{ t('sidebars.suggestions.accept') }}
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
            @click="emit('reject', suggestion.id)"
          >
            <X class="h-3 w-3" /> {{ t('sidebars.suggestions.reject') }}
          </button>
        </div>
      </li>
      <li v-if="count === 0" class="px-2 py-8 text-center text-[11px] text-slate-400 dark:text-slate-500">
        {{ t('sidebars.suggestions.empty') }}
      </li>
    </ol>
  </aside>
</template>
