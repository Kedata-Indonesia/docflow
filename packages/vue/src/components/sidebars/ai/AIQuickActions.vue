<script setup lang="ts">
import { useLocale } from '../../../composables/useLocale.js'
import type { QuickAction } from './types.js'

/**
 * Macro grid above the conversation. Every button is a `select` emit; the
 * sidebar decides whether the macro streams, improves the selection, or toggles
 * draft mode.
 */
defineProps<{
  actions: QuickAction[]
  /** A turn is in flight — every macro is disabled. */
  streaming: boolean
  /** Whether the editor currently has a non-empty selection. */
  hasSelection: boolean
  /** Draft mode is on — the "Draft with citations" button renders as active. */
  draftMode: boolean
}>()

const emit = defineEmits<{
  select: [action: QuickAction]
}>()

const { t } = useLocale()
</script>

<template>
  <div class="space-y-2 border-b border-slate-200 p-4 dark:border-white/5">
    <span class="block font-mono text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{{ t('sidebars.ai.quickMacros') }}</span>
    <div class="grid grid-cols-2 gap-2">
      <button
        v-for="action in actions"
        :key="action.label"
        type="button"
        :disabled="streaming || (action.needsSelection && !hasSelection) || action.disabled"
        :title="action.needsSelection && !hasSelection ? t('sidebars.ai.selectTextFirst') : action.label"
        :class="[
          'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-bold transition-colors disabled:opacity-40',
          action.draft && draftMode
            ? 'border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:border-cyan-400/50 dark:bg-cyan-500/15 dark:text-cyan-300'
            : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-cyan-500/50 dark:border-white/10 dark:bg-white/[0.02] dark:text-slate-300 dark:hover:border-cyan-500/30',
        ]"
        @click="emit('select', action)"
      >
        <component :is="action.icon" class="h-3 w-3" :class="action.color" />
        <span>{{ action.label }}</span>
      </button>
    </div>
  </div>
</template>
