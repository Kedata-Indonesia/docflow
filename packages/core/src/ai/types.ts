/**
 * Shared AI action types (Phase 7; pluggable AI provider — issue #119).
 *
 * The library (aiPlugin) is provider-agnostic: it never names a URL or holds a
 * key. The host injects `aiStream` / `aiDraft` via `EditorOptions` — either a
 * hand-written function or `toAIStreamFn(openaiCompatibleProvider({...}))`
 * (see ./provider.ts, ./openaiCompatibleProvider.ts).
 */
import type { AIProvider } from './provider.js'

/**
 * Factory shape for hosts that hand the library a provider object rather than
 * a plain function (plan §4.2). `toAIStreamFn` adapts an `AIProvider` to the
 * `AIStreamFn` port, so both shapes are accepted at the boundary.
 */
export type AIProviderFactory = (config: { signal?: AbortSignal }) => AIProvider


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

export interface AIContextLocation {
  page?: number
  pageCount?: number
  paragraphIndex?: number
  line?: number
  blockType?: string
  section?: string
}

export interface AIActionRequest {
  action: AIAction
  /** Selected text (7B). */
  selection?: string
  /** Bounded surrounding text — never the whole document. */
  context?: { before: string; after: string }
  /** Cursor location context (page, line, paragraph index, section heading). */
  location?: AIContextLocation
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

// ─── Phase 7E-4 — cited RAG drafting ─────────────────────────────────────────

/** One entry in the citation table carried by the SSE `done` event (§3.4). */
export interface AIDraftCitation {
  /** 1-based index matching a `[n]` marker in the streamed text. */
  ref: number
  /** `Source._id` string — the library maps markers through this table. */
  sourceId: string
  /** "first author family + year" tag, e.g. "Doe (2024)". */
  label: string
}

/**
 * Events yielded by `aiDraft` (§3.5). The `done` event carries the citation
 * table; the `error` event does NOT (the bug-hunter carry-forward — the client
 * treats BOTH `done` and `error` as terminal; Insert is enabled only on `done`).
 */
export type AIDraftEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; citations: AIDraftCitation[] }
  | { type: 'error'; message: string }

/**
 * The app implements this and injects it; the library never knows the URL.
 * Mirrors `AIStreamFn` but yields richer `AIDraftEvent`s (carries the citation
 * table on the terminal `done` event). Injected exactly like `aiStream`.
 */
export type AIDraftFn = (
  req: { prompt: string; context?: { before: string; after: string }; k?: number },
  signal: AbortSignal,
) => AsyncIterable<AIDraftEvent>
