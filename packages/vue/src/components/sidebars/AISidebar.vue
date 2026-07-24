<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ref, computed, watch, onUnmounted, nextTick, toRaw } from 'vue'
import { Sparkles, Send, Copy, Check, ArrowDownToLine, AlignLeft, BadgeCheck, Wand2, Globe, X, User, PencilLine } from 'lucide-vue-next'
import type { Editor } from '@tiptap/core'
import type { AIActionRequest, AIStreamFn } from '@kedata-indonesia/docflow-core'
import { useLocale } from '../../composables/useLocale.js'

/**
 * Doc-aware AI chat sidebar (Phase 7D).
 *
 * Rewritten from the old stub: no more direct `/api/ai/copilot` fetch (the
 * library-boundary leak), no whole-document payload, no non-streaming read.
 * Everything goes through the host-injected `aiStream` transport (editor →
 * server → LLM), assistant replies stream token-by-token, and "Insert" lands
 * in the document as a single ProseMirror transaction so it flows through
 * Yjs like a human edit.
 */

interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
  streaming?: boolean
  error?: boolean
}

const props = defineProps<{
  editor?: Editor | null
  /** Host-injected transport (apps/web). Falls back to the editorContext port. */
  aiStream?: AIStreamFn
}>()

const emit = defineEmits<{
  close: []
}>()

const { t } = useLocale()

/**
 * ProseMirror internals must never go through Vue's deep reactivity: a
 * proxied Editor yields proxied node/mark TYPES, breaking identity checks
 * (doc.eq → "Applying a mismatched transaction" on dispatch). Use this for
 * anything that touches state/view/storage.
 */
function pmEditor(): Editor | null {
  return props.editor ? toRaw(props.editor) : null
}

const turns = ref<ChatTurn[]>([])
const promptInput = ref('')
const isStreaming = ref(false)
const copiedIndex = ref<number | null>(null)
const insertedIndex = ref<number | null>(null)
const turnsEl = ref<HTMLElement | null>(null)

let abort: AbortController | null = null

/** The injected transport — prop first, editorContext port as fallback. */
const resolvedAiStream = computed<AIStreamFn | undefined>(() => {
  if (props.aiStream) return props.aiStream
  return (pmEditor()?.storage as any)?.editorContext?.aiStream
})

// ─── Selection awareness (macros that need one) ──────────────────────────────

const selectionTick = ref(0)
function handleTransaction() {
  selectionTick.value++
}

watch(
  () => props.editor,
  (newEditor, oldEditor) => {
    if (oldEditor) toRaw(oldEditor).off('transaction', handleTransaction)
    if (newEditor) toRaw(newEditor).on('transaction', handleTransaction)
  },
  { immediate: true },
)

const currentSelection = computed(() => {
  void selectionTick.value
  const state = pmEditor()?.state
  if (!state || state.selection.empty) return null
  const { from, to } = state.selection
  return { from, to, text: state.doc.textBetween(from, to, '\n', ' ') }
})

/** Bounded context around the selection (or cursor) — never the whole doc. */
function boundedContext(): { before: string; after: string } | undefined {
  const state = pmEditor()?.state
  if (!state) return undefined
  const { from, to } = state.selection
  const CAP = 1500
  return {
    before: state.doc.textBetween(Math.max(0, from - CAP), from, '\n', ' '),
    after: state.doc.textBetween(to, Math.min(state.doc.content.size, to + CAP), '\n', ' '),
  }
}

// ─── Streaming ────────────────────────────────────────────────────────────────

async function scrollToBottom() {
  await nextTick()
  if (turnsEl.value) turnsEl.value.scrollTop = turnsEl.value.scrollHeight
}

async function send(req: AIActionRequest, userLabel: string) {
  const stream = resolvedAiStream.value
  if (!stream || isStreaming.value) return

  abort?.abort()
  abort = new AbortController()
  isStreaming.value = true

  turns.value.push({ role: 'user', text: userLabel })
  turns.value.push({ role: 'assistant', text: '', streaming: true })
  // Mutate through turns.value[i] — a local reference to the raw object would
  // bypass Vue's reactivity (the proxy wraps on access, not on the original).
  const assistantIdx = turns.value.length - 1
  await scrollToBottom()

  try {
    for await (const chunk of stream(req, abort.signal)) {
      turns.value[assistantIdx].text += chunk
      scrollToBottom()
    }
    if (!turns.value[assistantIdx].text) {
      turns.value[assistantIdx].text = t('sidebars.ai.emptyResponse')
      turns.value[assistantIdx].error = true
    }
  } catch (err) {
    if (!abort.signal.aborted) {
      turns.value[assistantIdx].text = `${t('sidebars.ai.aiError')}: ${err instanceof Error ? err.message : String(err)}`
      turns.value[assistantIdx].error = true
    }
  } finally {
    turns.value[assistantIdx].streaming = false
    isStreaming.value = false
    abort = null
    scrollToBottom()
  }
}

function handleSubmit() {
  const prompt = promptInput.value.trim()
  if (!prompt || isStreaming.value) return
  promptInput.value = ''
  const selection = currentSelection.value
  send(
    {
      action: 'chat',
      prompt,
      ...(selection ? { selection: selection.text } : {}),
      context: boundedContext(),
    },
    prompt,
  )
}

// ─── Quick macros ─────────────────────────────────────────────────────────────

function runMacro(macro: {
  label: string
  action?: AIActionRequest['action']
  prompt?: string
  needsSelection?: boolean
}) {
  if (isStreaming.value || !macro.action) return
  const selection = currentSelection.value
  if (macro.needsSelection && !selection) return
  send(
    {
      action: macro.action,
      ...(selection ? { selection: selection.text } : {}),
      ...(macro.prompt ? { prompt: macro.prompt } : {}),
      context: boundedContext(),
    },
    macro.prompt ?? macro.label,
  )
}

/** 7D-2: chat-driven edit — routed through the 7B preview/transaction path,
 *  so the change is previewed in the editor and applied as ONE transaction. */
function improveSelection() {
  if (!currentSelection.value) return
  ;(pmEditor()?.commands as any)?.aiTransform?.({ action: 'rewrite' })
}

const quickActions = computed(() => [
  { label: t('sidebars.ai.summarize'), icon: AlignLeft, color: 'text-cyan-500', action: 'summarize' as const, needsSelection: true },
  { label: t('sidebars.ai.fixGrammar'), icon: BadgeCheck, color: 'text-emerald-500', action: 'grammar' as const, needsSelection: true },
  { label: t('sidebars.ai.continue'), icon: Wand2, color: 'text-amber-500', action: 'generate' as const, prompt: 'Continue writing naturally from where the text ends, matching the existing style.' },
  { label: t('sidebars.ai.toSpanish'), icon: Globe, color: 'text-cyan-500', action: 'translate' as const, prompt: 'translate to Spanish', needsSelection: true },
  { label: t('sidebars.ai.improveSelection'), icon: PencilLine, color: 'text-violet-500', improve: true, needsSelection: true },
])

// ─── Turn actions ─────────────────────────────────────────────────────────────

function handleCopy(turn: ChatTurn, index: number) {
  if (!turn.text) return
  navigator.clipboard.writeText(turn.text)
  copiedIndex.value = index
  setTimeout(() => (copiedIndex.value = null), 2000)
}

/** Insert into the document as ONE ProseMirror transaction → flows through
 *  Yjs like a human edit (the old stub's raw-text insert is gone). Uses the
 *  transaction API directly — chain().focus() can dispatch a mismatched
 *  transaction when the editor isn't focused (same lesson as the footnote
 *  insert in DocsEditor). */
function handleInsert(turn: ChatTurn, index: number) {
  const ed = pmEditor()
  if (!turn.text || !ed) return
  const { state, view } = ed
  const { from, to } = state.selection
  view.dispatch(state.tr.insertText(turn.text, from, to))
  view.focus()
  insertedIndex.value = index
  setTimeout(() => (insertedIndex.value = null), 2000)
}

function handleClose() {
  abort?.abort()
  isStreaming.value = false
  emit('close')
}

onUnmounted(() => {
  abort?.abort()
  pmEditor()?.off('transaction', handleTransaction)
})
</script>

<template>
  <div class="ai-sidebar flex h-full w-80 flex-shrink-0 flex-col border-l border-slate-200 bg-white/80 text-slate-800 backdrop-blur-xl transition-all dark:border-white/5 dark:bg-[#0a0f1e]/85 dark:text-slate-100">
    <div class="flex items-start justify-between border-b border-slate-200 p-4 dark:border-white/5">
      <div>
        <h3 class="flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          <Sparkles class="h-4 w-4 animate-pulse text-cyan-400" /> {{ t('sidebars.ai.title') }}
        </h3>
        <p class="mt-1.5 text-[10px] leading-relaxed text-slate-400 dark:text-slate-500">
          {{ t('sidebars.ai.description') }}
        </p>
      </div>
      <button
        type="button"
        class="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/5 dark:hover:text-slate-200"
        :aria-label="t('sidebars.ai.close')"
        @click="handleClose"
      >
        <X class="h-4 w-4" />
      </button>
    </div>

    <div v-if="!resolvedAiStream" class="flex flex-1 flex-col items-center justify-center p-6 text-center text-slate-400 dark:text-slate-500">
      <Sparkles class="mb-2 h-6 w-6 text-cyan-500 opacity-30" />
      <p class="text-xs">{{ t('sidebars.ai.notConfigured') }}</p>
    </div>

    <template v-else>
      <div class="space-y-2 border-b border-slate-200 p-4 dark:border-white/5">
        <span class="block font-mono text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{{ t('sidebars.ai.quickMacros') }}</span>
        <div class="grid grid-cols-2 gap-2">
          <button
            v-for="qa in quickActions"
            :key="qa.label"
            type="button"
            :disabled="isStreaming || (qa.needsSelection && !currentSelection)"
            :title="qa.needsSelection && !currentSelection ? t('sidebars.ai.selectTextFirst') : qa.label"
            class="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left text-[11px] font-bold text-slate-700 transition-colors hover:border-cyan-500/50 disabled:opacity-40 dark:border-white/10 dark:bg-white/[0.02] dark:text-slate-300 dark:hover:border-cyan-500/30"
            @click="qa.improve ? improveSelection() : runMacro(qa)"
          >
            <component :is="qa.icon" class="h-3 w-3" :class="qa.color" />
            <span>{{ qa.label }}</span>
          </button>
        </div>
      </div>

      <!-- Conversation -->
      <div ref="turnsEl" class="flex-1 space-y-3 overflow-y-auto p-4">
        <div v-if="turns.length === 0" class="flex h-full flex-col items-center justify-center p-4 text-center text-slate-400 dark:text-slate-500">
          <Sparkles class="mb-2 h-6 w-6 text-cyan-500 opacity-30" />
          <p class="text-[10px]">{{ t('sidebars.ai.noDraft') }}</p>
        </div>

        <div
          v-for="(turn, i) in turns"
          :key="i"
          class="flex flex-col gap-1"
          :class="turn.role === 'user' ? 'items-end' : 'items-start'"
        >
          <span class="flex items-center gap-1 font-mono text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            <User v-if="turn.role === 'user'" class="h-2.5 w-2.5" />
            <Sparkles v-else class="h-2.5 w-2.5 text-cyan-400" />
            {{ turn.role === 'user' ? t('sidebars.ai.you') : t('sidebars.ai.assistant') }}
          </span>
          <div
            class="max-w-full whitespace-pre-wrap rounded-xl px-3 py-2 text-xs leading-relaxed"
            :class="[
              turn.role === 'user'
                ? 'bg-cyan-500/10 text-slate-700 dark:bg-cyan-500/15 dark:text-slate-200'
                : turn.error
                  ? 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300'
                  : 'bg-slate-100 text-slate-700 dark:bg-white/[0.04] dark:text-slate-300',
            ]"
          >{{ turn.text }}<span v-if="turn.streaming" class="animate-pulse text-cyan-500">▌</span></div>

          <div v-if="turn.role === 'assistant' && !turn.streaming && !turn.error && turn.text" class="flex gap-1.5">
            <button
              type="button"
              class="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 transition-all hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.02] dark:text-slate-300 dark:hover:bg-white/5"
              @click="handleCopy(turn, i)"
            >
              <component :is="copiedIndex === i ? Check : Copy" class="h-3 w-3" :class="copiedIndex === i ? 'text-emerald-500' : ''" />
              <span>{{ copiedIndex === i ? t('sidebars.ai.copied') : t('sidebars.ai.copy') }}</span>
            </button>
            <button
              type="button"
              class="flex items-center gap-1 rounded-lg bg-cyan-500 px-2 py-1 text-[10px] font-bold text-black shadow-cyan transition-all hover:bg-cyan-400"
              @click="handleInsert(turn, i)"
            >
              <component :is="insertedIndex === i ? Check : ArrowDownToLine" class="h-3 w-3" />
              <span>{{ insertedIndex === i ? t('sidebars.ai.inserted') : t('sidebars.ai.insert') }}</span>
            </button>
          </div>
        </div>
      </div>

      <div class="border-t border-slate-200 bg-slate-50 p-4 dark:border-white/5 dark:bg-[#0a0f1e]/80">
        <form class="space-y-2" @submit.prevent="handleSubmit">
          <textarea
            v-model="promptInput"
            rows="2"
            :disabled="isStreaming"
            :placeholder="t('sidebars.ai.promptPlaceholder')"
            class="w-full min-h-[55px] resize-none rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-800 transition-all focus:border-cyan-500/50 focus:shadow-cyan focus:outline-none disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.02] dark:text-slate-100 dark:focus:border-cyan-500/30"
            @keydown.enter.exact.prevent="handleSubmit"
          />
          <div class="flex justify-end">
            <button
              type="submit"
              :disabled="isStreaming || !promptInput.trim()"
              class="flex items-center gap-1 rounded-lg bg-cyan-500 px-3.5 py-2 text-xs font-bold text-black shadow-cyan transition-all hover:bg-cyan-400 disabled:opacity-40"
            >
              <Send class="h-3.5 w-3.5" /> {{ t('sidebars.ai.promptAI') }}
            </button>
          </div>
        </form>
      </div>
    </template>
  </div>
</template>
