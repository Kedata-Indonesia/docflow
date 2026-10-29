import type { AIAction, AIStreamFn } from '@kedata-indonesia/docflow-core'

/** Inline transform over a selection, or generation at the cursor. */
export type AIMode = 'transform' | 'generate'

export interface AIPreviewState {
  mode: AIMode
  /** 'prompt' — waiting for the /ai instruction input (7C, generate only). */
  status: 'prompt' | 'streaming' | 'done' | 'error'
  /**
   * Transform: range of the original selection. Generate: collapsed cursor
   * position. Mapped through doc changes.
   */
  from: number
  to: number
  /** Selection text at start (transform) — detects external edits; '' for generate. */
  originalText: string
  /** Accumulated streamed text. */
  text: string
  action: AIAction
  error?: string
}

/** Meta-only transactions: the only channel the stream may use (no doc steps). */
export type AIMeta =
  | {
      type: 'start'
      mode: AIMode
      status: 'prompt' | 'streaming'
      from: number
      to: number
      originalText: string
      action: AIAction
    }
  | { type: 'chunk'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string }
  | { type: 'clear' }

/** editor.storage.ai — owned by AIExtension. */
export interface AIStorage {
  /** Mirror of the PM plugin state, refreshed on every transaction (for Vue). */
  preview: AIPreviewState | null
  /** Cancels the in-flight stream. */
  abort: AbortController | null
}

/** The editorContext port slice this plugin reads. */
export interface EditorContextStorage {
  aiStream?: AIStreamFn
}
