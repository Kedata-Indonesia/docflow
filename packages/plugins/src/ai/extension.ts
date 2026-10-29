import { Extension } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import type { AIAction, AIActionRequest } from '@kedata-indonesia/docflow-core'
import { markdownToFragment } from '../markdownInsert.js'
import { createAIPlugin } from './plugin.js'
import { aiPluginKey } from './pluginState.js'
import type { AIMeta, AIPreviewState, AIStorage } from './types.js'
import { boundedContext, getAIStreamPort, runAIStream, stopStream } from './stream.js'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    ai: {
      /** Start an AI transform over the current selection (streams a preview). */
      aiTransform: (options: { action: AIAction; prompt?: string }) => ReturnType
      /** Open the /ai prompt input at the cursor (7C). */
      aiGenerate: () => ReturnType
      /** Submit the /ai instruction and stream ghost text at the cursor (7C). */
      aiPromptSubmit: (options: { prompt: string }) => ReturnType
      /** Apply the streamed text in ONE transaction (replace or insert). */
      aiAccept: () => ReturnType
      /** Discard the preview; the document stays untouched. */
      aiReject: () => ReturnType
    }
  }
}

function aiStorage(editor: Editor): AIStorage {
  return (editor.storage as unknown as { ai: AIStorage }).ai
}

/**
 * AI writing assistance (Phase 7B inline transforms + 7C generation at cursor).
 *
 * The two non-negotiables from the phase-7 design:
 *
 *  1. Streaming NEVER mutates the document. Tokens accumulate in plugin state
 *     and render as decorations (highlight + ghost preview). Meta-only
 *     transactions carry no steps, so a collaborative Yjs doc sees zero churn
 *     while a preview streams.
 *  2. Accept is ONE ProseMirror transaction replacing the selection range
 *     (transform) or inserting at the cursor (generate), so y-prosemirror
 *     propagates it exactly like a human edit.
 *
 * The library never names a URL: the host injects `aiStream` through the
 * editorContext port (mirroring onImageUpload). Without it, actions are inert.
 *
 * This module holds the commands + lifecycle; rendering lives in
 * `ai/{plugin,widgets}.ts`, the reducer in `ai/pluginState.ts`, and the
 * transport plumbing in `ai/stream.ts`.
 */
export const AIExtension = Extension.create({
  name: 'ai',

  addStorage() {
    return {
      preview: null as AIPreviewState | null,
      abort: null as AbortController | null,
    }
  },

  addCommands() {
    return {
      aiTransform:
        (options: { action: AIAction; prompt?: string }) =>
        ({ editor, state, dispatch }): boolean => {
          if (aiPluginKey.getState(state)) return false // a preview is already active
          if (!getAIStreamPort(editor)) {
            console.warn('[ai] no aiStream port injected — AI actions are inert')
            return false
          }
          const { from, to, empty } = state.selection
          if (empty) return false
          const originalText = state.doc.textBetween(from, to, '\n', ' ')
          if (!originalText.trim()) return false

          const abort = new AbortController()
          aiStorage(editor).abort = abort
          dispatch?.(
            state.tr.setMeta(aiPluginKey, {
              type: 'start',
              mode: 'transform',
              status: 'streaming',
              from,
              to,
              originalText,
              action: options.action,
            } satisfies AIMeta),
          )

          const req: AIActionRequest = {
            action: options.action,
            selection: originalText,
            context: boundedContext(state, from, to),
            ...(options.prompt ? { prompt: options.prompt } : {}),
          }
          runAIStream(editor, req, abort)
          return true
        },

      aiGenerate:
        () =>
        ({ editor, state, dispatch }): boolean => {
          if (aiPluginKey.getState(state)) return false
          if (!getAIStreamPort(editor)) {
            console.warn('[ai] no aiStream port injected — AI actions are inert')
            return false
          }
          // The prompt input is a decoration; a non-empty selection must never
          // be replaced by /ai — always collapse to the cursor position.
          const pos = state.selection.to
          dispatch?.(
            state.tr.setMeta(aiPluginKey, {
              type: 'start',
              mode: 'generate',
              status: 'prompt',
              from: pos,
              to: pos,
              originalText: '',
              action: 'generate',
            } satisfies AIMeta),
          )
          return true
        },

      aiPromptSubmit:
        (options: { prompt: string }) =>
        ({ editor, state, dispatch }): boolean => {
          const preview = aiPluginKey.getState(state)
          if (!preview || preview.mode !== 'generate' || preview.status !== 'prompt') return false
          const prompt = options.prompt?.trim()
          if (!prompt) return false

          const abort = new AbortController()
          aiStorage(editor).abort = abort
          dispatch?.(
            state.tr.setMeta(aiPluginKey, {
              type: 'start',
              mode: 'generate',
              status: 'streaming',
              from: preview.from,
              to: preview.to,
              originalText: '',
              action: 'generate',
            } satisfies AIMeta),
          )

          const req: AIActionRequest = {
            action: 'generate',
            prompt,
            context: boundedContext(state, preview.from, preview.to),
          }
          runAIStream(editor, req, abort)
          // Return focus to the editor (the input widget is gone now) so
          // Enter/Tab/Esc accept/reject work via the plugin's handleKeyDown.
          editor.commands.focus()
          return true
        },

      aiAccept:
        () =>
        ({ editor, state, dispatch }): boolean => {
          const preview = aiPluginKey.getState(state)
          if (!preview || preview.status === 'prompt') return false
          stopStream(editor)
          if (!dispatch) return true
          const tr = state.tr
          if (preview.text.trim()) {
            // THE accept: a single doc-changing transaction → flows through Yjs.
            // Works for both modes: transform replaces [from,to), generate
            // inserts at the collapsed position. The preview is parsed as
            // INLINE markdown (→ bold/italic/code/link render, the leading
            // paragraph is unwrapped) via the `tiptap-markdown` Markdown
            // extension registered on aiPlugin. Falls back to a single plain
            // text node when the Markdown extension isn't available, so a
            // stripped build keeps the 7B/7C behavior.
            const fragment = markdownToFragment(editor, preview.text, { inline: true })
            if (fragment) {
              tr.replaceWith(preview.from, preview.to, fragment)
            } else {
              tr.replaceWith(preview.from, preview.to, state.schema.text(preview.text))
            }
          }
          tr.setMeta(aiPluginKey, { type: 'clear' } satisfies AIMeta)
          dispatch(tr)
          return true
        },

      aiReject:
        () =>
        ({ editor, state, dispatch }): boolean => {
          const preview = aiPluginKey.getState(state)
          if (!preview) return false
          stopStream(editor)
          dispatch?.(state.tr.setMeta(aiPluginKey, { type: 'clear' } satisfies AIMeta))
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    return [createAIPlugin(this.editor)]
  },

  // Mirror the PM plugin state into extension storage so Vue components
  // (BubbleMenu) can read it without importing the plugin key.
  onTransaction(this: { editor: Editor }): void {
    aiStorage(this.editor).preview = aiPluginKey.getState(this.editor.state) ?? null
  },

  onDestroy(this: { editor: Editor }): void {
    const storage = aiStorage(this.editor)
    storage.abort?.abort()
    storage.abort = null
    storage.preview = null
  },
})
