<script setup lang="ts">
import {
  ArrowDownToLine,
  Check,
  Copy,
  Loader2,
  Quote,
  Sparkles,
  TriangleAlert,
  User,
} from 'lucide-vue-next'
import { useLocale } from '../../../composables/useLocale.js'
import type { ChatTurn } from './types.js'

/**
 * One conversation entry: role label, answer bubble (with the streaming caret),
 * a separately-rendered failure note, the draft's citation chips, and the
 * copy/insert actions.
 */
const props = defineProps<{
  turn: ChatTurn
  /** The copy button shows its check-mark state. */
  copied: boolean
  /** The insert button shows its check-mark state. */
  inserted: boolean
  /** `canInsert(turn)` — a failed draft keeps Insert disabled. */
  insertable: boolean
}>()

const emit = defineEmits<{
  copy: []
  insert: []
}>()

const { t } = useLocale()
</script>

<template>
  <div class="flex flex-col gap-1" :class="props.turn.role === 'user' ? 'items-end' : 'items-start'">
    <span
      class="flex items-center gap-1 font-mono text-[9px] font-bold uppercase tracking-widest
        text-slate-400 dark:text-slate-500"
    >
      <User v-if="props.turn.role === 'user'" class="h-2.5 w-2.5" />
      <Sparkles v-else class="h-2.5 w-2.5 text-cyan-400" />
      {{ props.turn.role === 'user' ? t('sidebars.ai.you') : t('sidebars.ai.assistant') }}
    </span>
    <!-- Waiting for the first token: show a real loading cue instead of an
         empty bubble (the caret alone reads as “broken”). -->
    <div
      v-if="props.turn.role === 'assistant' && props.turn.streaming && !props.turn.text && !props.turn.error"
      class="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs
        text-slate-500 dark:bg-white/[0.04] dark:text-slate-400"
    >
      <Loader2 class="h-3.5 w-3.5 animate-spin text-cyan-500" />
      <span>{{ t('sidebars.ai.thinking') }}</span>
    </div>
    <!-- Answer bubble (partial or final). Failures are NOT painted over the
         text — the error note below carries them, so any partial answer the
         user already saw keeps its normal styling. -->
    <div
      v-else-if="props.turn.text"
      class="max-w-full whitespace-pre-wrap rounded-xl px-3 py-2 text-xs leading-relaxed"
      :class="
        props.turn.role === 'user'
          ? 'bg-cyan-500/10 text-slate-700 dark:bg-cyan-500/15 dark:text-slate-200'
          : 'bg-slate-100 text-slate-700 dark:bg-white/[0.04] dark:text-slate-300'
      "
    >{{ props.turn.text }}<span v-if="props.turn.streaming" class="animate-pulse text-cyan-500">▌</span></div>

    <!-- Failure note — kept separate from the answer above. -->
    <div
      v-if="props.turn.role === 'assistant' && props.turn.error"
      class="flex max-w-full flex-col gap-0.5 rounded-xl bg-red-50 px-3 py-2 text-[11px]
        leading-relaxed dark:bg-red-500/10"
    >
      <span class="flex items-center gap-1.5 font-semibold text-red-700 dark:text-red-300">
        <TriangleAlert class="h-3 w-3" /> {{ t('sidebars.ai.aiError') }}
      </span>
      <span v-if="props.turn.errorText" class="text-red-600/90 dark:text-red-300/90">{{ props.turn.errorText }}</span>
      <span class="text-red-500/80 dark:text-red-300/70">{{ t('sidebars.ai.errorHint') }}</span>
    </div>

    <!-- Citation chips under a draft turn (rendered after `done`). -->
    <div
      v-if="props.turn.role === 'assistant' && props.turn.citations && props.turn.citations.length > 0"
      class="flex flex-wrap gap-1 pl-1"
    >
      <span
        v-for="citation in props.turn.citations"
        :key="citation.ref"
        class="inline-flex items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/5
          px-2 py-0.5 text-[10px] font-semibold text-cyan-700 dark:border-cyan-400/30
          dark:bg-cyan-500/10 dark:text-cyan-300"
      >
        <Quote class="h-2.5 w-2.5" />{{ citation.label }}
      </span>
    </div>

    <div
      v-if="props.turn.role === 'assistant' && !props.turn.streaming && (props.turn.text || props.turn.error)"
      class="flex gap-1.5"
    >
      <button
        v-if="props.turn.text"
        type="button"
        class="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1
          text-[10px] font-semibold text-slate-600 transition-all hover:bg-slate-50
          dark:border-white/10 dark:bg-white/[0.02] dark:text-slate-300 dark:hover:bg-white/5"
        @click="emit('copy')"
      >
        <component :is="copied ? Check : Copy" class="h-3 w-3" :class="copied ? 'text-emerald-500' : ''" />
        <span>{{ copied ? t('sidebars.ai.copied') : t('sidebars.ai.copy') }}</span>
      </button>
      <button
        v-if="insertable"
        type="button"
        class="flex items-center gap-1 rounded-lg bg-cyan-500 px-2 py-1 text-[10px] font-bold
          text-black shadow-cyan transition-all hover:bg-cyan-400"
        @click="emit('insert')"
      >
        <component :is="inserted ? Check : ArrowDownToLine" class="h-3 w-3" />
        <span>{{ inserted ? t('sidebars.ai.inserted') : t('sidebars.ai.insert') }}</span>
      </button>
    </div>
  </div>
</template>
