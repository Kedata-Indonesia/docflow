<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ref, computed, watch, onMounted, onUnmounted, nextTick, toRaw } from 'vue'
import { Sparkles, Send, Copy, Check, ArrowDownToLine, AlignLeft, BadgeCheck, Wand2, Globe, X, User, PencilLine, Quote, FileText } from 'lucide-vue-next'
import type { Editor } from '@tiptap/core'
import { Slice, Fragment } from 'prosemirror-model'
import type { AIActionRequest, AIStreamFn, AIDraftCitation, AIDraftEvent, AIDraftFn, AIContextLocation } from '@kedata-indonesia/docflow-core'
import { getCitationEngine, insertMarkdownBlock } from '@kedata-indonesia/docflow-plugins'
import { useLocale } from '../../composables/useLocale.js'
import { buildContentArray, stripMarkers } from './markerGrammar.js'
import { collectSelectionContext } from '../../utils/selectionContext.js'

/**
 * Doc-aware AI chat sidebar (Phase 7D) + cited-drafting (Phase 7E-4).
 *
 * No more direct `/api/ai/copilot` fetch (the library-boundary leak), no
 * whole-document payload, no non-streaming read. Everything goes through the
 * host-injected `aiStream` / `aiDraft` transports (editor → server → LLM),
 * assistant replies stream token-by-token, and "Insert" lands in the document
 * as a single ProseMirror transaction so it flows through Yjs like a human edit.
 *
 * 7E-4: a "Draft with citations" quick action toggles draft mode; the prompt
 * is sent to `/api/ai/draft` via `aiDraft`, which streams text carrying `[n]`
 * markers and a terminal `done` event with a `{ ref, sourceId, label }` table.
 * Insert maps markers through the table to Phase 6 citation nodes and dispatch
 * ONE `view.dispatch(tr.replace(...))` (the §2 decision 6 — N markers must
 * NOT become N transactions / N Yjs history entries). The model output is
 * untrusted — only markers that resolve through the server-owned table become
 * citations; unresolved markers are stripped from the inserted text.
 *
 * Boundary: `aiStream` / `aiDraft` are declared library ports on
 * `EditorOptions` — see docs/LIBRARY_CONTRACT.md §2.1 and
 * docs/plans/PLUGGABLE_AI_PROVIDER.md. The library never names an AI endpoint;
 * hosts inject transports (`toAIStreamFn(openaiCompatibleProvider({...}))` or
 * a custom function).
 */

interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
  streaming?: boolean
  error?: boolean
  /** 7E-4: the citation table for a draft turn (set on the `done` event). */
  citations?: AIDraftCitation[]
}

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

/** 7E-4: the host-injected draft transport (yields `AIDraftEvent`s). */
const resolvedAiDraft = computed<AIDraftFn | undefined>(() => {
  if (props.aiDraft) return props.aiDraft
  return (pmEditor()?.storage as any)?.editorContext?.aiDraft
})

/** 7E-4: when true, the submit form drives `sendDraft` (→ /api/ai/draft) instead of chat. */
const draftMode = ref(false)

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

// ─── Location context (issue #219) — page/paragraph/line/section ─────────────

/** Best-effort location of the cursor/selection, recomputed on transactions. */
const locationContext = computed<AIContextLocation>(() => {
  void selectionTick.value
  const ed = pmEditor()
  if (!ed) return {}
  try {
    return collectSelectionContext(ed)
  } catch {
    return {}
  }
})

/** Compact chip text: "Hal. 3/12 · Alinea 2 · Baris 5 · BAB II …". */
const contextChipText = computed(() => {
  const loc = locationContext.value
  const parts: string[] = []
  if (loc.page && loc.pageCount && loc.pageCount > 1) {
    parts.push(`${t('sidebars.ai.pageShort')} ${loc.page}/${loc.pageCount}`)
  }
  if (loc.paragraphIndex && loc.paragraphIndex > 1) {
    parts.push(`${t('sidebars.ai.paragraphShort')} ${loc.paragraphIndex}`)
  }
  if (loc.line && loc.line > 1) {
    parts.push(`${t('sidebars.ai.lineShort')} ${loc.line}`)
  }
  if (loc.section) {
    parts.push(loc.section.length > 40 ? `${loc.section.slice(0, 40)}…` : loc.section)
  }
  return parts.join(' · ')
})

/** Truncated quoted snippet of the current selection, if any. */
const selectionSnippet = computed(() => {
  const sel = currentSelection.value
  if (!sel || !sel.text.trim()) return ''
  const s = sel.text.trim().replace(/\s+/g, ' ')
  return s.length > 60 ? `“${s.slice(0, 60)}…”` : `“${s}”`
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

/** Bounded surrounding text + location context (page/paragraph/line/section). */
function fullContext(): { before: string; after: string } & AIContextLocation {
  const b = boundedContext()
  return { before: b?.before ?? '', after: b?.after ?? '', ...locationContext.value }
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
  if (draftMode.value) {
    // 7E-4: draft → /api/ai/draft (no selection/action; §3.4 wire is leaner).
    sendDraft({ prompt, context: fullContext() }, prompt)
    return
  }
  const selection = currentSelection.value
  send(
    {
      action: 'chat',
      prompt,
      ...(selection ? { selection: selection.text } : {}),
      context: fullContext(),
    },
    prompt,
  )
}

/**
 * 7E-4: drive the host-injected `aiDraft` transport (→ POST /api/ai/draft).
 * Yields `AIDraftEvent`s: `delta` (append text), `done` (set the citation
 * table — enables Insert), `error` (mark the turn errored, clear citations —
 * the bug-hunter carry-forward: Insert stays disabled on `error`).
 */
async function sendDraft(req: { prompt: string; context?: { before: string; after: string } }, userLabel: string) {
  const stream = resolvedAiDraft.value
  if (!stream || isStreaming.value) return

  abort?.abort()
  abort = new AbortController()
  isStreaming.value = true

  turns.value.push({ role: 'user', text: userLabel })
  turns.value.push({ role: 'assistant', text: '', streaming: true })
  const assistantIdx = turns.value.length - 1
  await scrollToBottom()

  try {
    for await (const event of stream(req, abort.signal) as AsyncIterable<AIDraftEvent>) {
      if (event.type === 'delta') {
        turns.value[assistantIdx].text += event.text
        scrollToBottom()
      } else if (event.type === 'done') {
        // The citation table arrived — enables Insert (the load-bearing §3.4
        // wire: the table is the only source for sourceId; markers flow through
        // it). Empty table = 0-results path; Insert still works (plain text).
        turns.value[assistantIdx].citations = event.citations
      } else if (event.type === 'error') {
        turns.value[assistantIdx].text = `${t('sidebars.ai.aiError')}: ${event.message}`
        turns.value[assistantIdx].error = true
        // Carry-forward: no citations on error → Insert button hidden via v-if
        // (turn.error === true breaks the gating) → stays disabled.
        turns.value[assistantIdx].citations = undefined
      }
    }
    if (!turns.value[assistantIdx].text && !turns.value[assistantIdx].error) {
      turns.value[assistantIdx].text = t('sidebars.ai.emptyResponse')
      turns.value[assistantIdx].error = true
    }
  } catch (err) {
    if (!abort.signal.aborted) {
      turns.value[assistantIdx].text = `${t('sidebars.ai.aiError')}: ${err instanceof Error ? err.message : String(err)}`
      turns.value[assistantIdx].error = true
      turns.value[assistantIdx].citations = undefined
    }
  } finally {
    turns.value[assistantIdx].streaming = false
    isStreaming.value = false
    abort = null
    scrollToBottom()
  }
}

/** 7E-4: toggle draft mode on/off via the "Draft with citations" quick action. */
function toggleDraftMode() {
  draftMode.value = !draftMode.value
  // Focus the prompt textarea so the user can immediately type the draft request.
  nextTick(() => {
    const ta = document.querySelector<HTMLTextAreaElement>('.ai-sidebar textarea')
    ta?.focus()
  })
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
      context: fullContext(),
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

interface QuickAction {
  label: string
  icon: typeof Sparkles
  color: string
  action?: AIActionRequest['action']
  prompt?: string
  needsSelection?: boolean
  improve?: boolean
  draft?: boolean
  disabled?: boolean
}

const quickActions = computed<QuickAction[]>(() => [
  { label: t('sidebars.ai.summarize'), icon: AlignLeft, color: 'text-cyan-500', action: 'summarize', needsSelection: true },
  { label: t('sidebars.ai.fixGrammar'), icon: BadgeCheck, color: 'text-emerald-500', action: 'grammar', needsSelection: true },
  { label: t('sidebars.ai.continue'), icon: Wand2, color: 'text-amber-500', action: 'generate', prompt: 'Continue writing naturally from where the text ends, matching the existing style.' },
  { label: t('sidebars.ai.toSpanish'), icon: Globe, color: 'text-cyan-500', action: 'translate', prompt: 'translate to Spanish', needsSelection: true },
  { label: t('sidebars.ai.improveSelection'), icon: PencilLine, color: 'text-violet-500', improve: true, needsSelection: true },
  // 7E-4: "Draft with citations" toggles draft mode (no immediate action).
  // Only enabled when the host injected aiDraft; disabled otherwise.
  { label: t('sidebars.ai.draft'), icon: Quote, color: 'text-cyan-500', draft: true, disabled: !resolvedAiDraft.value },
])

// ─── Turn actions ─────────────────────────────────────────────────────────────

function handleCopy(turn: ChatTurn, index: number) {
  if (!turn.text) return
  navigator.clipboard.writeText(turn.text)
  copiedIndex.value = index
  setTimeout(() => (copiedIndex.value = null), 2000)
}

/** Shared insert-feedback flash (the `inserted` check-mark on the button). */
function markInserted(index: number) {
  insertedIndex.value = index
  setTimeout(() => {
    if (insertedIndex.value === index) insertedIndex.value = null
  }, 2000)
}

/**
 * UNIFIED insert (7E-4) — ONE substantive `view.dispatch` per turn regardless
 * of branch (the §2 decision 6 — never N dispatches for N markers):
 *
 *   1. Plain-text path (preserves 7D behavior for chat turns AND for draft
 *      turns whose `done` arrived with `citations: []` — 0-results): a single
 *      `tr.insertText(turn.text, from, to)` dispatch.
 *   2. Citation content-array path (draft turn with ≥1 citation): build ONE
 *      content array via `buildContentArray` (text spans interleaved with
 *      `buildCitationNodes` specs — the helper owns the note-vs-inline
 *      branching so this file does NOT duplicate it) and dispatch ONE
 *      `view.dispatch(state.tr.replace(from, to, slice))`. (ProseMirror
 *      `Transaction` has no `insertContent` helper — that's a TipTap chain
 *      command that dispatches per call; the raw-PM primitive that lands the
 *      same effect in ONE dispatch is `tr.replace` with a closed slice of
 *      inline nodes.) The `CitationEngineExtension.onUpdate` walk fires on
 *      this single dispatch → `onSourcesChange` → the host's snapshot persist
 *      → peers render via Phase 6 snapshot (no new rendering path; not bypassed).
 *   3. No-engine fallback for a cited draft: strip the markers (so a draft
 *      with `[n]` but no citation engine inserts clean text, no leak) and
 *      fall back to the plain-text path.
 *
 * Uses the transaction API directly — chain().focus() can dispatch a mismatched
 * transaction when the editor isn't focused (same lesson as the footnote insert
 * in DocsEditor). `view.focus()` afterward may fire a cosmetic zero-step tr
 * (scroll/focus) — it does NOT expand Yjs history or push to collab, so the
 * "ONE history entry" invariant holds (the content-array insert is one step). */
function handleInsert(turn: ChatTurn, index: number) {
  const ed = pmEditor()
  if (!turn.text || !ed) return
  const { state, view } = ed
  const { from, to } = state.selection

  if (!turn.citations || turn.citations.length === 0) {
    // Markdown-aware path: parse the streamed text as BLOCK markdown (tables,
    // lists, headings, bold, code…) and insert it as real nodes via a direct
    // `view.dispatch` (NOT `editor.commands` — the Markdown extension's
    // `insertContentAt` override forces `inline:true`, which would drop the
    // leading paragraph and mangle a table). Falls back to `insertText` when
    // the Markdown extension isn't registered (preserves 7D plain-text Insert).
    insertMarkdownBlock(ed, view, from, to, turn.text)
    view.focus()
    markInserted(index)
    return
  }

  const engine = getCitationEngine(ed)
  if (!engine) {
    // No citation engine — strip markers, then insert as block markdown so a
    // draft with `[n]` markers but no engine still renders headings/lists/
    // tables rather than leaking literal `##` / `|` characters.
    insertMarkdownBlock(ed, view, from, to, stripMarkers(turn.text))
    view.focus()
    markInserted(index)
    return
  }

  // Citation content-array path — ONE substantive dispatch (§2 decision 6).
  const tableByRef = new Map(turn.citations.map((c) => [c.ref, c]))
  const array = buildContentArray(turn.text, tableByRef, engine)
  const schema = state.schema
  const nodes = array
    .map((part) => {
      if (typeof part === 'string') return schema.text(part)
      return schema.nodeFromJSON(part)
    })
    .filter((n): n is NonNullable<typeof n> => Boolean(n))
  const slice = new Slice(Fragment.from(nodes), 0, 0)
  view.dispatch(state.tr.replace(from, to, slice))
  view.focus()
  markInserted(index)
}

onMounted(() => {
  // Issue #219: focus the prompt when the chat opens (bubble "Chat" button /
  // ⌘L flow) so the user can type immediately with the selection context on.
  nextTick(() => {
    document.querySelector<HTMLTextAreaElement>('.ai-sidebar textarea')?.focus()
  })
})

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
            :disabled="isStreaming || (qa.needsSelection && !currentSelection) || ('disabled' in qa && qa.disabled)"
            :title="qa.needsSelection && !currentSelection ? t('sidebars.ai.selectTextFirst') : qa.label"
            :class="[
              'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-bold transition-colors disabled:opacity-40',
              'draft' in qa && qa.draft && draftMode
                ? 'border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:border-cyan-400/50 dark:bg-cyan-500/15 dark:text-cyan-300'
                : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-cyan-500/50 dark:border-white/10 dark:bg-white/[0.02] dark:text-slate-300 dark:hover:border-cyan-500/30',
            ]"
            @click="qa.improve ? improveSelection() : ('draft' in qa && qa.draft) ? toggleDraftMode() : runMacro(qa as Parameters<typeof runMacro>[0])"
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

          <!-- 7E-4: citation chips under a draft turn (rendered after `done`). -->
          <div
            v-if="turn.role === 'assistant' && turn.citations && turn.citations.length > 0"
            class="flex flex-wrap gap-1 pl-1"
          >
            <span
              v-for="c in turn.citations"
              :key="c.ref"
              class="inline-flex items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/5 px-2 py-0.5 text-[10px] font-semibold text-cyan-700 dark:border-cyan-400/30 dark:bg-cyan-500/10 dark:text-cyan-300"
            >
              <Quote class="h-2.5 w-2.5" />{{ c.label }}
            </span>
          </div>

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
        <!-- Issue #219: attached-context chip — page/paragraph/line/section + selection snippet -->
        <div v-if="contextChipText || selectionSnippet" class="mb-2 space-y-1">
          <span class="block font-mono text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            {{ t('sidebars.ai.contextLabel') }}
          </span>
          <div class="flex flex-wrap gap-1">
            <span
              v-if="contextChipText"
              class="inline-flex items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/5 px-2 py-0.5 text-[10px] font-semibold text-cyan-700 dark:border-cyan-400/30 dark:bg-cyan-500/10 dark:text-cyan-300"
            >
              <FileText class="h-2.5 w-2.5" />{{ contextChipText }}
            </span>
            <span
              v-if="selectionSnippet"
              class="inline-flex max-w-full items-center gap-1 truncate rounded-full border border-violet-500/30 bg-violet-500/5 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:border-violet-400/30 dark:bg-violet-500/10 dark:text-violet-300"
              :title="currentSelection?.text"
            >
              <span class="truncate">{{ selectionSnippet }}</span>
            </span>
          </div>
        </div>
        <form class="space-y-2" @submit.prevent="handleSubmit">
          <textarea
            v-model="promptInput"
            rows="2"
            :disabled="isStreaming"
            :placeholder="draftMode ? t('sidebars.ai.draftPlaceholder') : t('sidebars.ai.promptPlaceholder')"
            class="w-full min-h-[55px] resize-none rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-800 transition-all focus:border-cyan-500/50 focus:shadow-cyan focus:outline-none disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.02] dark:text-slate-100 dark:focus:border-cyan-500/30"
            @keydown.enter.exact.prevent="handleSubmit"
          />
          <div class="flex justify-end">
            <button
              type="submit"
              :disabled="isStreaming || !promptInput.trim()"
              class="flex items-center gap-1 rounded-lg bg-cyan-500 px-3.5 py-2 text-xs font-bold text-black shadow-cyan transition-all hover:bg-cyan-400 disabled:opacity-40"
            >
              <Send class="h-3.5 w-3.5" /> {{ draftMode ? t('sidebars.ai.promptDraft') : t('sidebars.ai.promptAI') }}
            </button>
          </div>
        </form>
      </div>
    </template>
  </div>
</template>
