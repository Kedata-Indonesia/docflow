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

/**
 * Location context of the selection/cursor sent alongside the request so the
 * LLM can reason about *where* in the document the user is pointing. All fields
 * optional — hosts that don't fill them keep working unchanged (issue #219).
 */
export interface AIContextLocation {
  /** 1-based page number containing the selection head (DOM pagination). */
  page?: number
  /** Total pages in the document (DOM pagination). */
  pageCount?: number
  /** 1-based paragraph/block index within the document. */
  paragraphIndex?: number
  /** 1-based line number of the selection head within its block. */
  line?: number
  /** Node type of the block under the selection, e.g. 'paragraph' | 'heading' | 'bulletList' | 'tableRow'. */
  blockType?: string
  /** Nearest preceding heading text (BAB/section context), e.g. 'BAB II …'. */
  section?: string
}

/**
 * Payload for the host's AI-chat hook (issue #219). Carries the selected text
 * (if any) plus the cursor/selection location so a host with its OWN chat panel
 * can pre-fill the prompt with context — without re-reading editor state.
 */
export interface AiChatRequestContext {
  /** Selected text, when the selection is not empty. */
  selection?: string
  /** Location of the selection/cursor (page, paragraph, line, section…). */
  context: AIContextLocation
}

export interface AIActionRequest {
  action: AIAction
  /** Selected text (7B). */
  selection?: string
  /** Bounded surrounding text — never the whole document. */
  context?: { before: string; after: string } & AIContextLocation
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
  req: { prompt: string; context?: { before: string; after: string } & AIContextLocation; k?: number },
  signal: AbortSignal,
) => AsyncIterable<AIDraftEvent>
