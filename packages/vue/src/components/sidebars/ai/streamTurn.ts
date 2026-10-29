import type { Ref } from 'vue'
import type {
  AIActionRequest,
  AIDraftEvent,
  AIDraftFn,
  AIStreamFn,
} from '@kedata-indonesia/docflow-core'
import type { Localize, ChatTurn } from './types.js'

/**
 * Transport pumps for one assistant turn. Both transports stream into the same
 * `turns[index]` slot and share the rule that a failure NEVER overwrites text
 * the user already saw — it rides alongside in `errorText`.
 */
export interface TurnPumpContext {
  turns: Ref<ChatTurn[]>
  index: number
  signal: AbortSignal
  scroll: () => void
  t: Localize
}

export async function pumpChat(
  stream: AIStreamFn,
  request: AIActionRequest,
  ctx: TurnPumpContext,
): Promise<void> {
  const turn = () => ctx.turns.value[ctx.index]
  try {
    for await (const chunk of stream(request, ctx.signal)) {
      turn().text += chunk
      ctx.scroll()
    }
    if (!turn().text) {
      // Empty answer is a soft failure: keep it out of `text` so the insert
      // button stays meaningless, and surface it via the error note instead.
      turn().error = true
      turn().errorText = ctx.t('sidebars.ai.emptyResponse')
    }
  } catch (error) {
    if (ctx.signal.aborted) return
    turn().error = true
    turn().errorText = messageOf(error)
  }
}

/**
 * Drives the host-injected `aiDraft` transport (→ POST /api/ai/draft).
 * `delta` appends text, `done` sets the citation table that enables Insert, and
 * `error` clears citations so Insert stays disabled — the bug-hunter
 * carry-forward that keeps unresolved `[n]` markers out of the document.
 */
export async function pumpDraft(
  stream: AIDraftFn,
  request: { prompt: string; context?: { before: string; after: string } },
  ctx: TurnPumpContext,
): Promise<void> {
  const turn = () => ctx.turns.value[ctx.index]
  try {
    for await (const event of stream(request, ctx.signal) as AsyncIterable<AIDraftEvent>) {
      if (event.type === 'delta') {
        turn().text += event.text
        ctx.scroll()
      } else if (event.type === 'done') {
        // The citation table is the only source for sourceId; an empty table is
        // the 0-results path and Insert still works (plain text).
        turn().citations = event.citations
      } else if (event.type === 'error') {
        turn().error = true
        turn().errorText = event.message
        turn().citations = undefined
      }
    }
    if (!turn().text && !turn().error) {
      turn().error = true
      turn().errorText = ctx.t('sidebars.ai.emptyResponse')
    }
  } catch (error) {
    if (ctx.signal.aborted) return
    turn().error = true
    turn().errorText = messageOf(error)
    turn().citations = undefined
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
