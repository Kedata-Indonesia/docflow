/**
 * The library's only knowledge of LLMs (pluggable AI provider — issue #119).
 *
 * `AIProvider` is a thin transport: one prompt in, a stream of events out.
 * The library imports only this type — never an implementation. Hosts plug in
 * `openaiCompatibleProvider` (the default we ship) or their own class wrapping
 * an agent SDK, a proxy, or an in-process model. Agent orchestration, tool
 * calling, RAG, and multi-turn memory live behind the host's endpoint, not in
 * the library. See docs/plans/PLUGGABLE_AI_PROVIDER.md §4.1.
 */

export type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; stopReason?: string }
  | { type: 'error'; error: Error }

export interface AICompleteRequest {
  system?: string
  prompt: string
  signal?: AbortSignal
}

export interface AIProvider {
  complete(req: AICompleteRequest): AsyncIterable<StreamEvent>
}
