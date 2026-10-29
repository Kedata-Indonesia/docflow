import { nextTick, onUnmounted, ref, type ComputedRef, type Ref } from 'vue'
import type { AIActionRequest, AIDraftFn, AIStreamFn } from '@kedata-indonesia/docflow-core'
import { useLocale } from '../../../composables/useLocale.js'
import { pumpChat, pumpDraft } from './streamTurn.js'
import type { ChatTurn, DraftRequest } from './types.js'

export interface AIConversationOptions {
  aiStream: ComputedRef<AIStreamFn | undefined>
  aiDraft: ComputedRef<AIDraftFn | undefined>
  /** Scroll container of the conversation list (owned by the sidebar). */
  turnsEl: Ref<HTMLElement | null>
}

/**
 * Conversation state and the two transports. The sidebar owns DOM and layout;
 * this composable owns turns, streaming flags and the abort controller, so both
 * transports share one lifecycle (one in-flight turn at a time).
 */
export function useAIConversation(options: AIConversationOptions) {
  const { t } = useLocale()

  const turns = ref<ChatTurn[]>([])
  const isStreaming = ref(false)
  const copiedIndex = ref<number | null>(null)
  const insertedIndex = ref<number | null>(null)

  let abort: AbortController | null = null

  async function scrollToBottom(): Promise<void> {
    await nextTick()
    const element = options.turnsEl.value
    if (element) element.scrollTop = element.scrollHeight
  }

  function beginTurn(kind: 'chat' | 'draft', userLabel: string): number {
    abort?.abort()
    abort = new AbortController()
    isStreaming.value = true
    turns.value.push({ role: 'user', text: userLabel })
    turns.value.push({ role: 'assistant', text: '', streaming: true, kind })
    // Mutate through turns.value[i] — a local reference to the raw object would
    // bypass Vue's reactivity (the proxy wraps on access, not on the original).
    void scrollToBottom()
    return turns.value.length - 1
  }

  function endTurn(index: number): void {
    turns.value[index].streaming = false
    isStreaming.value = false
    abort = null
    void scrollToBottom()
  }

  async function send(request: AIActionRequest, userLabel: string): Promise<void> {
    const stream = options.aiStream.value
    if (!stream || isStreaming.value) return
    const index = beginTurn('chat', userLabel)
    const { signal } = abort as AbortController
    await pumpChat(stream, request, {
      turns,
      index,
      signal,
      scroll: () => void scrollToBottom(),
      t,
    })
    endTurn(index)
  }

  async function sendDraft(request: DraftRequest, userLabel: string): Promise<void> {
    const stream = options.aiDraft.value
    if (!stream || isStreaming.value) return
    const index = beginTurn('draft', userLabel)
    const { signal } = abort as AbortController
    await pumpDraft(stream, request, {
      turns,
      index,
      signal,
      scroll: () => void scrollToBottom(),
      t,
    })
    endTurn(index)
  }

  function handleCopy(turn: ChatTurn, index: number): void {
    if (!turn.text) return
    void navigator.clipboard.writeText(turn.text)
    copiedIndex.value = index
    setTimeout(() => (copiedIndex.value = null), 2000)
  }

  /** Shared insert-feedback flash (the check-mark on the button). */
  function markInserted(index: number): void {
    insertedIndex.value = index
    setTimeout(() => {
      if (insertedIndex.value === index) insertedIndex.value = null
    }, 2000)
  }

  /** Stop the in-flight turn (the partial text, if any, is kept). */
  function handleStop(): void {
    abort?.abort()
  }

  function abortCurrent(): void {
    abort?.abort()
    abort = null
    isStreaming.value = false
  }

  onUnmounted(() => abort?.abort())

  return {
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
  }
}
