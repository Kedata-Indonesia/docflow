<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref } from 'vue'
import { Sparkles, X } from 'lucide-vue-next'
import type { Editor } from '@tiptap/core'
import type { AIDraftFn, AIStreamFn } from '@kedata-indonesia/docflow-core'
import { useLocale } from '../../composables/useLocale.js'
import { readEditorContext } from '../../composables/editorContext.js'
import AIQuickActions from './ai/AIQuickActions.vue'
import AIPromptForm from './ai/AIPromptForm.vue'
import AITurnBubble from './ai/AITurnBubble.vue'
import { canInsert, insertTurn } from './ai/insertTurn.js'
import { toRawEditor } from './ai/pmEditor.js'
import { buildQuickActions } from './ai/quickActions.js'
import { useAIConversation } from './ai/useAIConversation.js'
import { useAISelection } from './ai/useAISelection.js'
import type { ChatTurn, MacroSpec, QuickAction } from './ai/types.js'

/**
 * Doc-aware AI chat sidebar (Phase 7D) + cited-drafting (Phase 7E-4).
 *
 * No direct `/api/ai/copilot` fetch (the library-boundary leak), no
 * whole-document payload, no non-streaming read. Everything goes through the
 * host-injected `aiStream` / `aiDraft` transports (editor → server → LLM),
 * assistant replies stream token-by-token, and "Insert" lands in the document
 * as a single ProseMirror transaction so it flows through Yjs like a human edit.
 *
 * 7E-4: a "Draft with citations" quick action toggles draft mode; the prompt is
 * sent to `/api/ai/draft` via `aiDraft`, which streams text carrying `[n]`
 * markers and a terminal `done` event with a `{ ref, sourceId, label }` table.
 * Insert maps markers through the table to Phase 6 citation nodes and dispatches
 * ONE transaction (N markers must NOT become N Yjs history entries). The model
 * output is untrusted — only markers that resolve through the server-owned table
 * become citations; unresolved markers are stripped from the inserted text.
 *
 * Boundary: `aiStream` / `aiDraft` are declared library ports on `EditorOptions`
 * — see docs/reference/LIBRARY_CONTRACT.md §2.1 and
 * docs/plans/PLUGGABLE_AI_PROVIDER.md. The library never names an AI endpoint.
 *
 * This file is the composition root; the transport plumbing lives in
 * `ai/useAIConversation.ts` + `ai/streamTurn.ts`, marker→node insertion in
 * `ai/insertTurn.ts`, selection awareness in `ai/useAISelection.ts`, and the
 * three panes in `ai/AI{QuickActions,TurnBubble,PromptForm}.vue`.
 */

const props = defineProps<{
  editor?: Editor | null
  /** Host-injected transport (apps/web). Falls back to the editorContext port. */
  aiStream?: AIStreamFn
  /** 7E-4: host-injected draft transport (yielding `AIDraftEvent`s). */
  aiDraft?: AIDraftFn
}>()

const emit = defineEmits<{
  close: []
}>()

const { t } = useLocale()

const { currentSelection, boundedContext, handleTransaction } = useAISelection(
  () => props.editor,
)

/** The scroll container of the conversation list (read by the composable). */
const turnsEl = ref<HTMLElement | null>(null)

/** The injected transport — prop first, editorContext port as fallback. */
const resolvedAiStream = computed<AIStreamFn | undefined>(() => {
  if (props.aiStream) return props.aiStream
  return readEditorContext(toRawEditor(props.editor))?.aiStream
})

/** 7E-4: the host-injected draft transport (yields `AIDraftEvent`s). */
const resolvedAiDraft = computed<AIDraftFn | undefined>(() => {
  if (props.aiDraft) return props.aiDraft
  return readEditorContext(toRawEditor(props.editor))?.aiDraft
})

const {
  turns,
  isStreaming,
  copiedIndex,
  insertedIndex,
  send,
  sendDraft,
  handleCopy,
  markInserted,
  handleStop,
  abortCurrent,
} = useAIConversation({ aiStream: resolvedAiStream, aiDraft: resolvedAiDraft, turnsEl })

/** 7E-4: when true, the submit form drives `sendDraft` instead of chat. */
const draftMode = ref(false)
const promptInput = ref('')

const quickActions = computed(() => buildQuickActions(t, Boolean(resolvedAiDraft.value)))

function handleSubmit() {
  const prompt = promptInput.value.trim()
  if (!prompt || isStreaming.value) return
  promptInput.value = ''
  if (draftMode.value) {
    // 7E-4: draft → /api/ai/draft (no selection/action; §3.4 wire is leaner).
    void sendDraft({ prompt, context: boundedContext() }, prompt)
    return
  }
  const selection = currentSelection.value
  void send(
    {
      action: 'chat',
      prompt,
      ...(selection ? { selection: selection.text } : {}),
      context: boundedContext(),
    },
    prompt,
  )
}

function runMacro(macro: MacroSpec) {
  if (isStreaming.value || !macro.action) return
  const selection = currentSelection.value
  if (macro.needsSelection && !selection) return
  void send(
    {
      action: macro.action,
      ...(selection ? { selection: selection.text } : {}),
      ...(macro.prompt ? { prompt: macro.prompt } : {}),
      context: boundedContext(),
    },
    macro.prompt ?? macro.label,
  )
}

/** 7D-2: chat-driven edit — routed through the preview/transaction path. */
function improveSelection() {
  if (!currentSelection.value) return
  // `aiTransform` is registered by the aiPlugin; keep the optional call so a
  // host that injects an aiStream port without loading that plugin is a no-op.
  const commands = toRawEditor(props.editor)?.commands as unknown as
    | { aiTransform?: (options: { action: 'rewrite' }) => boolean }
    | undefined
  commands?.aiTransform?.({ action: 'rewrite' })
}

function onQuickAction(action: QuickAction) {
  if (action.improve) {
    improveSelection()
    return
  }
  if (action.draft) {
    toggleDraftMode()
    return
  }
  runMacro(action)
}

/** 7E-4: toggle draft mode and focus the prompt so the user can type at once. */
function toggleDraftMode() {
  draftMode.value = !draftMode.value
  void nextTick(() => {
    const textarea = document.querySelector<HTMLTextAreaElement>('.ai-sidebar textarea')
    textarea?.focus()
  })
}

function onInsert(turn: ChatTurn, index: number) {
  insertTurn(toRawEditor(props.editor), turn, () => markInserted(index), t)
}

function handleClose() {
  abortCurrent()
  emit('close')
}

onUnmounted(() => {
  toRawEditor(props.editor)?.off('transaction', handleTransaction)
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
      <AIQuickActions
        :actions="quickActions"
        :streaming="isStreaming"
        :has-selection="Boolean(currentSelection)"
        :draft-mode="draftMode"
        @select="onQuickAction"
      />

      <!-- Conversation -->
      <div ref="turnsEl" class="flex-1 space-y-3 overflow-y-auto p-4">
        <div v-if="turns.length === 0" class="flex h-full flex-col items-center justify-center p-4 text-center text-slate-400 dark:text-slate-500">
          <Sparkles class="mb-2 h-6 w-6 text-cyan-500 opacity-30" />
          <p class="text-[10px]">{{ t('sidebars.ai.noDraft') }}</p>
        </div>

        <AITurnBubble
          v-for="(turn, index) in turns"
          :key="index"
          :turn="turn"
          :copied="copiedIndex === index"
          :inserted="insertedIndex === index"
          :insertable="canInsert(turn)"
          @copy="handleCopy(turn, index)"
          @insert="onInsert(turn, index)"
        />
      </div>

      <AIPromptForm
        v-model="promptInput"
        :streaming="isStreaming"
        :draft-mode="draftMode"
        @submit="handleSubmit"
        @stop="handleStop"
      />
    </template>
  </div>
</template>
