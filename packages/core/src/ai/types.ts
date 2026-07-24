/**
 * Shared AI action types (Phase 7).
 *
 * The library (aiPlugin) is provider-agnostic: it never names a URL or holds a
 * key. The app implements `AIStreamFn` (apps/web/src/ai/aiStream.ts) and injects
 * it; the server owns provider selection via env config.
 */

export type AIAction =
  | 'rewrite'
  | 'summarize'
  | 'grammar'
  | 'tone'
  | 'translate'
  | 'expand'
  | 'shorten' // 7B — inline transforms
  | 'generate' // 7C — generation at cursor
  | 'chat' // 7D — doc-aware chat
  | 'draft' // 7E — cited RAG drafting

export interface AIActionRequest {
  action: AIAction
  /** Selected text (7B). */
  selection?: string
  /** Bounded surrounding text — never the whole document. */
  context?: { before: string; after: string }
  /** User instruction (/ai prompt, chat message, tone target, target language). */
  prompt?: string
  /** For doc-aware chat / RAG scoping. */
  documentId?: string
  options?: Record<string, unknown>
}

/**
 * The app implements this and injects it; the library never knows the URL.
 * Yields streamed text chunks in order; stops at end of stream, throws on error.
 */
export type AIStreamFn = (req: AIActionRequest, signal: AbortSignal) => AsyncIterable<string>
