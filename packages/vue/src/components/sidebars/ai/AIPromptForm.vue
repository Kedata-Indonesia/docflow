<script setup lang="ts">
import { Send, Square } from 'lucide-vue-next'
import { useLocale } from '../../../composables/useLocale.js'

/**
 * Prompt composer. Enter submits, Shift+Enter breaks the line; while a turn is
 * streaming the send button becomes a stop button (the partial answer is kept).
 */
const props = defineProps<{
  modelValue: string
  streaming: boolean
  /** Draft mode swaps the placeholder and the send label. */
  draftMode: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  submit: []
  stop: []
}>()

const { t } = useLocale()
</script>

<template>
  <div class="border-t border-slate-200 bg-slate-50 p-4 dark:border-white/5 dark:bg-[#0a0f1e]/80">
    <form class="space-y-2" @submit.prevent="emit('submit')">
      <textarea
        :value="props.modelValue"
        rows="2"
        :disabled="props.streaming"
        :placeholder="
          props.draftMode ? t('sidebars.ai.draftPlaceholder') : t('sidebars.ai.promptPlaceholder')
        "
        class="w-full min-h-[55px] resize-none rounded-xl border border-slate-200 bg-white p-2.5 text-xs
          text-slate-800 transition-all focus:border-cyan-500/50 focus:shadow-cyan focus:outline-none
          disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.02] dark:text-slate-100
          dark:focus:border-cyan-500/30"
        @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
        @keydown.enter.exact.prevent="emit('submit')"
      />
      <div class="flex justify-end">
        <button
          v-if="props.streaming"
          type="button"
          class="flex items-center gap-1 rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-bold
            text-slate-600 transition-all hover:bg-slate-100 dark:border-white/15 dark:text-slate-300
            dark:hover:bg-white/5"
          @click="emit('stop')"
        >
          <Square class="h-3.5 w-3.5" /> {{ t('sidebars.ai.stop') }}
        </button>
        <button
          v-else
          type="submit"
          :disabled="!props.modelValue.trim()"
          class="flex items-center gap-1 rounded-lg bg-cyan-500 px-3.5 py-2 text-xs font-bold text-black
            shadow-cyan transition-all hover:bg-cyan-400 disabled:opacity-40"
        >
          <Send class="h-3.5 w-3.5" /> {{ props.draftMode ? t('sidebars.ai.promptDraft') : t('sidebars.ai.promptAI') }}
        </button>
      </div>
    </form>
  </div>
</template>
