import { PluginKey } from '@tiptap/pm/state'
import type { Transaction } from '@tiptap/pm/state'
import type { AIMeta, AIPreviewState } from './types.js'

export const aiPluginKey = new PluginKey<AIPreviewState | null>('docflow-ai')

/**
 * The whole preview reducer: meta-only transactions drive the stream, and doc
 * changes map (or conservatively cancel) the preview so a remote edit can never
 * make Accept replace the wrong range.
 */
export function applyPreviewTransaction(
  tr: Transaction,
  prev: AIPreviewState | null,
): AIPreviewState | null {
  const meta = tr.getMeta(aiPluginKey) as AIMeta | undefined
  if (meta) {
    switch (meta.type) {
      case 'start':
        return {
          mode: meta.mode,
          status: meta.status,
          from: meta.from,
          to: meta.to,
          originalText: meta.originalText,
          text: '',
          action: meta.action,
        }
      case 'chunk':
        return prev ? { ...prev, text: prev.text + meta.text } : prev
      case 'done':
        return prev ? { ...prev, status: 'done' as const } : prev
      case 'error':
        return prev ? { ...prev, status: 'error' as const, error: meta.message } : prev
      case 'clear':
        return null
    }
  }
  if (!prev) return prev

  // Clicking/moving the cursor away while the /ai input is open cancels it (the
  // input's own blur handler covers pointer focus).
  if (prev.status === 'prompt' && tr.selectionSet) return null

  if (tr.docChanged) {
    if (prev.mode === 'generate') {
      // Collapsed position: just map it through the edit.
      const pos = tr.mapping.map(prev.from, 1)
      return { ...prev, from: pos, to: pos }
    }
    // Transform: someone (local or remote) edited while the preview is active —
    // map the range, and cancel conservatively if the text under it no longer
    // matches what we captured.
    const from = tr.mapping.map(prev.from, -1)
    const to = tr.mapping.map(prev.to, 1)
    if (to <= from || tr.doc.textBetween(from, to, '\n', ' ') !== prev.originalText) {
      return null
    }
    return { ...prev, from, to }
  }
  return prev
}
