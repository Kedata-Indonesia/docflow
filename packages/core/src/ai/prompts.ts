/**
 * Per-action prompt assembly (pluggable AI provider — issue #119).
 *
 * Ported from the Phase 7 server proxy (`apps/server/src/ai/context.ts`) so
 * the browser can call the LLM directly: the selection + BOUNDED surrounding
 * text is sent — never the whole document (cost + privacy). Untrusted document
 * text stays in the user prompt; instructions live in the system prompt
 * (prompt-injection hygiene).
 */
import type { AIActionRequest } from './types.js'

/** Max characters of surrounding context sent on each side of the selection. */
export const CONTEXT_CHAR_CAP = 1500

const ONLY_RESULT =
  'Return ONLY the resulting text — no preamble, no explanation, no commentary, no markdown fences.'

const SYSTEM_PROMPTS = {
  rewrite: `You are a writing assistant. Rewrite the selected text to improve clarity, flow, and style while preserving its meaning. ${ONLY_RESULT}`,
  summarize: `You are a writing assistant. Summarize the selected text concisely, keeping every key point. ${ONLY_RESULT}`,
  grammar: `You are a writing assistant. Fix grammar, spelling, and punctuation in the selected text without changing its meaning or voice. ${ONLY_RESULT}`,
  tone: `You are a writing assistant. Adjust the tone of the selected text as instructed while preserving its content. ${ONLY_RESULT}`,
  translate: `You are a writing assistant. Translate the selected text as instructed, preserving structure and formatting. ${ONLY_RESULT}`,
  expand: `You are a writing assistant. Expand the selected text with relevant detail, staying on topic and matching the existing style. ${ONLY_RESULT}`,
  shorten: `You are a writing assistant. Shorten the selected text, keeping its essential meaning. ${ONLY_RESULT}`,
  generate: `You are a writing assistant embedded in a document editor. Write the text the user asks for so it fits the surrounding context. ${ONLY_RESULT}`,
  chat: 'You are a helpful writing assistant embedded in a document editor. Answer the user’s question. Use the provided document context when it is relevant; say so when it is not enough to answer.',
} as const

/** Last `CONTEXT_CHAR_CAP` chars of the preceding text (nearest context wins). */
export function trimContextBefore(text: string): string {
  return text.length > CONTEXT_CHAR_CAP ? `…${text.slice(-CONTEXT_CHAR_CAP)}` : text
}

/** First `CONTEXT_CHAR_CAP` chars of the following text. */
export function trimContextAfter(text: string): string {
  return text.length > CONTEXT_CHAR_CAP ? `${text.slice(0, CONTEXT_CHAR_CAP)}…` : text
}

function quote(label: string, text: string): string {
  return `${label}:\n"""${text}"""`
}

function contextSection(req: AIActionRequest): string[] {
  const parts: string[] = []
  if (req.context) {
    const before = trimContextBefore(req.context.before ?? '')
    const after = trimContextAfter(req.context.after ?? '')
    if (before) parts.push(quote('Text before', before))
    if (after) parts.push(quote('Text after', after))
  }
  return parts
}

/**
 * Assemble the per-action system prompt + user prompt from a bounded request.
 * `draft` is rejected: RAG-cited drafting goes through the `aiDraft` port,
 * which owns its grounded-prompt assembly (Phase 7E).
 */
export function buildAIPrompt(req: AIActionRequest): { system: string; prompt: string } {
  let system: string
  const userParts: string[] = []

  switch (req.action) {
    case 'rewrite':
    case 'summarize':
    case 'grammar':
    case 'expand':
    case 'shorten':
      system = SYSTEM_PROMPTS[req.action]
      userParts.push(quote('Selected text', req.selection ?? ''))
      break
    case 'tone':
      system = SYSTEM_PROMPTS.tone
      userParts.push(quote('Selected text', req.selection ?? ''))
      userParts.push(`Target tone: ${req.prompt ?? 'professional'}`)
      break
    case 'translate':
      system = SYSTEM_PROMPTS.translate
      userParts.push(quote('Selected text', req.selection ?? ''))
      userParts.push(`Target language: ${req.prompt ?? 'English'}`)
      break
    case 'generate':
      system = SYSTEM_PROMPTS.generate
      userParts.push(`Instruction: ${req.prompt ?? ''}`)
      break
    case 'chat':
      system = SYSTEM_PROMPTS.chat
      if (req.selection) userParts.push(quote('Selected text', req.selection))
      userParts.push(req.prompt ?? '')
      break
    case 'draft':
      throw new Error(
        "action 'draft' is not built via buildAIPrompt — use the aiDraft port (Phase 7E)",
      )
    default: {
      const exhaustive: never = req.action
      throw new Error(`Unknown AI action: ${String(exhaustive)}`)
    }
  }

  userParts.push(...contextSection(req))

  return { system, prompt: userParts.filter(Boolean).join('\n\n') }
}
