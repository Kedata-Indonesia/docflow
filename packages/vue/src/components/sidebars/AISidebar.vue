<script setup lang="ts">
import { ref, computed } from 'vue'
import { Sparkles, Send, Copy, Check, ArrowDownToLine, AlignLeft, BadgeCheck, Wand2, Globe } from 'lucide-vue-next'
import { useLocale } from '../../composables/useLocale.js'

// Base URL for backend API (set at build time for separate-domain deployments)
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

const props = defineProps<{
  documentContent?: string
}>()

const emit = defineEmits<{
  insert: [text: string]
}>()

const { t } = useLocale()

const promptInput = ref('')
const aiResult = ref('')
const isLoading = ref(false)
const copied = ref(false)
const inserted = ref(false)

async function handleAICall(action?: string, promptText?: string) {
  isLoading.value = true
  inserted.value = false

  try {
    const response = await fetch(`${API_BASE}/api/ai/copilot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: promptText || promptInput.value.trim(),
        content: props.documentContent,
        action: action || 'custom',
      }),
    })
    const data = await response.json()
    if (response.ok && data.result) {
      aiResult.value = data.result
    } else if (data.error) {
      aiResult.value = `❌ AI Helper Error:\n\n${data.error}`
    }
  } catch (err) {
    aiResult.value = '❌ Network Failure: Could not connect to the AI backend.'
    console.error(err)
  } finally {
    isLoading.value = false
    promptInput.value = ''
  }
}

function handleCopy() {
  if (!aiResult.value) return
  navigator.clipboard.writeText(aiResult.value)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}

function handleInsert() {
  if (!aiResult.value) return
  emit('insert', aiResult.value)
  inserted.value = true
  setTimeout(() => (inserted.value = false), 2000)
}

const quickActions = computed(() => [
  { label: t('sidebars.ai.summarize'), icon: AlignLeft, action: 'summarize', color: 'text-cyan-500' },
  { label: t('sidebars.ai.fixGrammar'), icon: BadgeCheck, action: 'correct', color: 'text-emerald-500' },
  { label: t('sidebars.ai.continue'), icon: Wand2, action: 'continue', color: 'text-amber-500' },
  { label: t('sidebars.ai.toSpanish'), icon: Globe, action: undefined, prompt: 'Translate the current document content cleanly into professional Spanish.', color: 'text-cyan-500' },
])
</script>

<template>
  <div class="ai-sidebar flex h-full w-80 flex-shrink-0 flex-col border-l border-slate-200 bg-white/80 text-slate-800 backdrop-blur-xl transition-all dark:border-white/5 dark:bg-[#0a0f1e]/85 dark:text-slate-100">
    <div class="border-b border-slate-200 p-4 dark:border-white/5">
      <h3 class="flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
        <Sparkles class="h-4 w-4 animate-pulse text-cyan-400" /> {{ t('sidebars.ai.title') }}
      </h3>
      <p class="mt-1.5 text-[10px] leading-relaxed text-slate-400 dark:text-slate-500">
        {{ t('sidebars.ai.description') }}
      </p>
    </div>

    <div class="flex-1 space-y-4 overflow-y-auto p-4">
      <div class="space-y-2">
        <span class="block font-mono text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{{ t('sidebars.ai.quickMacros') }}</span>
        <div class="grid grid-cols-2 gap-2">
          <button
            v-for="qa in quickActions"
            :key="qa.label"
            type="button"
            :disabled="isLoading || !documentContent"
            class="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left text-[11px] font-bold text-slate-700 transition-colors hover:border-cyan-500/50 disabled:opacity-40 dark:border-white/10 dark:bg-white/[0.02] dark:text-slate-300 dark:hover:border-cyan-500/30"
            @click="qa.action ? handleAICall(qa.action) : handleAICall(undefined, qa.prompt)"
          >
            <component :is="qa.icon" class="h-3 w-3" :class="qa.color" />
            <span>{{ qa.label }}</span>
          </button>
        </div>
      </div>

      <div class="space-y-1.5">
        <span class="block font-mono text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{{ t('sidebars.ai.generations') }}</span>
        <div class="relative flex min-h-[220px] flex-col justify-between rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700 dark:border-white/10 dark:bg-[#02040a]/50 dark:text-slate-300">
          <div v-if="isLoading" class="absolute inset-0 z-10 flex flex-col items-center justify-center space-y-3 rounded-xl bg-white/70 dark:bg-[#02040a]/80">
            <div class="h-6 w-6 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
            <p class="animate-pulse font-mono text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">{{ t('sidebars.ai.aiDrafting') }}</p>
          </div>

          <div v-if="aiResult" class="space-y-4">
            <div class="prose prose-sm max-h-[300px] max-w-full overflow-x-auto overflow-y-auto whitespace-pre-wrap pr-1 leading-relaxed dark:prose-invert">
              {{ aiResult }}
            </div>

            <div class="flex justify-end gap-2 border-t border-slate-200/60 pt-2.5 dark:border-white/5">
              <button
                type="button"
                class="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 transition-all hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.02] dark:text-slate-300 dark:hover:bg-white/5"
                @click="handleCopy"
              >
                <component :is="copied ? Check : Copy" class="h-3 w-3" :class="copied ? 'text-emerald-500' : ''" />
                <span>{{ copied ? t('sidebars.ai.copied') : t('sidebars.ai.copy') }}</span>
              </button>

              <button
                type="button"
                class="flex items-center gap-1 rounded-lg bg-cyan-500 px-2.5 py-1.5 text-[10px] font-bold text-black shadow-cyan transition-all hover:bg-cyan-400"
                @click="handleInsert"
              >
                <component :is="inserted ? Check : ArrowDownToLine" class="h-3 w-3" />
                <span>{{ inserted ? t('sidebars.ai.inserted') : t('sidebars.ai.insert') }}</span>
              </button>
            </div>
          </div>

          <div v-else class="flex flex-1 flex-col items-center justify-center p-4 text-center text-slate-400 dark:text-slate-500">
            <Sparkles class="mb-2 h-6 w-6 text-cyan-500 opacity-30" />
            <p class="text-[10px]">{{ t('sidebars.ai.noDraft') }}</p>
          </div>
        </div>
      </div>
    </div>

    <div class="border-t border-slate-200 bg-slate-50 p-4 dark:border-white/5 dark:bg-[#0a0f1e]/80">
      <form
        class="space-y-2"
        @submit.prevent="promptInput.trim() && handleAICall()"
      >
        <textarea
          v-model="promptInput"
          rows="2"
          :disabled="isLoading"
          :placeholder="t('sidebars.ai.promptPlaceholder')"
          class="w-full min-h-[55px] resize-none rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-800 transition-all focus:border-cyan-500/50 focus:shadow-cyan focus:outline-none disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.02] dark:text-slate-100 dark:focus:border-cyan-500/30"
        />
        <div class="flex justify-end">
          <button
            type="submit"
            :disabled="isLoading || !promptInput.trim()"
            class="flex items-center gap-1 rounded-lg bg-cyan-500 px-3.5 py-2 text-xs font-bold text-black shadow-cyan transition-all hover:bg-cyan-400 disabled:opacity-40"
          >
            <Send class="h-3.5 w-3.5" /> {{ t('sidebars.ai.promptAI') }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
