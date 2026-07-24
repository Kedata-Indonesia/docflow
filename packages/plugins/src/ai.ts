import { Extension } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import type { EditorState } from '@tiptap/pm/state'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { definePlugin } from '@kedata-indonesia/docflow-core'
import type { AIAction, AIActionRequest, AIStreamFn } from '@kedata-indonesia/docflow-core'

/**
 * AI inline transforms (Phase 7B).
 *
 * The two non-negotiables from the phase-7 design:
 *
 *  1. Streaming NEVER mutates the document. Tokens accumulate in plugin state
 *     and render as decorations (highlight + ghost preview). Meta-only
 *     transactions carry no steps, so a collaborative Yjs doc sees zero churn
 *     while a preview streams.
 *  2. Accept is ONE ProseMirror transaction replacing the selection range,
 *     so y-prosemirror propagates it exactly like a human edit.
 *
 * The library never names a URL: the host injects `aiStream` through the
 * editorContext port (mirroring onImageUpload). Without it, actions are inert.
 */

export interface AIPreviewState {
  status: 'streaming' | 'done' | 'error'
  /** Range of the original selection, mapped through doc changes. */
  from: number
  to: number
  /** Selection text at start — used to detect external edits under the preview. */
  originalText: string
  /** Accumulated streamed text. */
  text: string
  action: AIAction
  error?: string
}

export const aiPluginKey = new PluginKey<AIPreviewState | null>('docflow-ai')

type AIMeta =
  | { type: 'start'; from: number; to: number; originalText: string; action: AIAction }
  | { type: 'chunk'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string }
  | { type: 'clear' }

interface EditorContextStorage {
  aiStream?: AIStreamFn
}

/** editor.storage.ai — owned by AIExtension. */
export interface AIStorage {
  /** Mirror of the PM plugin state, refreshed on every transaction (for Vue). */
  preview: AIPreviewState | null
  /** Cancels the in-flight stream. */
  abort: AbortController | null
}

/** Bounded surrounding text sent to the server — never the whole document. */
const CONTEXT_CHARS = 1500

export function getAIPreview(editor: Editor): AIPreviewState | null {
  return (editor.storage as Record<string, unknown>).ai
    ? ((editor.storage as unknown as { ai: AIStorage }).ai.preview ?? null)
    : null
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    ai: {
      /** Start an AI transform over the current selection (streams a preview). */
      aiTransform: (options: { action: AIAction; prompt?: string }) => ReturnType
      /** Replace the selection with the streamed text in ONE transaction. */
      aiAccept: () => ReturnType
      /** Discard the preview; the document stays untouched. */
      aiReject: () => ReturnType
    }
  }
}

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
          const storage = (editor.storage as unknown as { ai: AIStorage }).ai
          if (aiPluginKey.getState(state)) return false // a preview is already active
          const aiStream = (
            (editor.storage as Record<string, unknown>).editorContext as EditorContextStorage | undefined
          )?.aiStream
          if (!aiStream) {
            console.warn('[ai] no aiStream port injected — AI actions are inert')
            return false
          }
          const { from, to, empty } = state.selection
          if (empty) return false
          const originalText = state.doc.textBetween(from, to, '\n', ' ')
          if (!originalText.trim()) return false

          const before = state.doc.textBetween(Math.max(0, from - CONTEXT_CHARS), from, '\n', ' ')
          const after = state.doc.textBetween(
            to,
            Math.min(state.doc.content.size, to + CONTEXT_CHARS),
            '\n',
            ' ',
          )

          const abort = new AbortController()
          storage.abort = abort
          dispatch?.(
            state.tr.setMeta(aiPluginKey, {
              type: 'start',
              from,
              to,
              originalText,
              action: options.action,
            } satisfies AIMeta),
          )

          const req: AIActionRequest = {
            action: options.action,
            selection: originalText,
            context: { before, after },
            ...(options.prompt ? { prompt: options.prompt } : {}),
          }

          // Async streaming loop — the command contract stays synchronous
          // (same pattern as citationPlugin's interactive insert).
          void (async () => {
            const push = (meta: AIMeta) => {
              if (abort.signal.aborted || editor.isDestroyed) return
              editor.view.dispatch(editor.state.tr.setMeta(aiPluginKey, meta))
            }
            try {
              for await (const chunk of aiStream(req, abort.signal)) {
                if (abort.signal.aborted || editor.isDestroyed) return
                push({ type: 'chunk', text: chunk })
              }
              push({ type: 'done' })
            } catch (err) {
              push({
                type: 'error',
                message: err instanceof Error ? err.message : 'AI request failed',
              })
            }
          })()

          return true
        },

      aiAccept:
        () =>
        ({ editor, state, dispatch }): boolean => {
          const preview = aiPluginKey.getState(state)
          if (!preview) return false
          const storage = (editor.storage as unknown as { ai: AIStorage }).ai
          storage.abort?.abort()
          storage.abort = null
          if (!dispatch) return true
          const tr = state.tr
          if (preview.text.trim()) {
            // THE accept: a single doc-changing transaction → flows through Yjs.
            tr.replaceWith(preview.from, preview.to, state.schema.text(preview.text))
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
          const storage = (editor.storage as unknown as { ai: AIStorage }).ai
          storage.abort?.abort()
          storage.abort = null
          dispatch?.(state.tr.setMeta(aiPluginKey, { type: 'clear' } satisfies AIMeta))
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin<AIPreviewState | null>({
        key: aiPluginKey,
        state: {
          init: () => null,
          apply(tr, prev) {
            const meta = tr.getMeta(aiPluginKey) as AIMeta | undefined
            if (meta) {
              switch (meta.type) {
                case 'start':
                  return {
                    status: 'streaming',
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
            if (prev && tr.docChanged) {
              // Someone (local or remote) edited while the preview is active:
              // map the range, and cancel conservatively if the text under it
              // no longer matches what we captured — never accept stale text.
              const from = tr.mapping.map(prev.from, -1)
              const to = tr.mapping.map(prev.to, 1)
              if (to <= from || tr.doc.textBetween(from, to, '\n', ' ') !== prev.originalText) {
                return null
              }
              return { ...prev, from, to }
            }
            return prev
          },
        },
        props: {
          decorations(state: EditorState): DecorationSet {
            const preview = aiPluginKey.getState(state)
            if (!preview) return DecorationSet.empty

            const ghost = document.createElement('span')
            if (preview.status === 'error') {
              ghost.className = 'docs-ai-ghost docs-ai-ghost--error'
              ghost.textContent = ` ${preview.error ?? 'AI error'} — press Esc`
            } else {
              ghost.className = 'docs-ai-ghost'
              ghost.textContent = preview.text + (preview.status === 'streaming' ? '▌' : '')
              if (preview.status === 'done') {
                const hint = document.createElement('span')
                hint.className = 'docs-ai-ghost-hint'
                hint.textContent = ' ⏎ accept · esc reject'
                ghost.appendChild(hint)
              }
            }

            return DecorationSet.create(state.doc, [
              Decoration.inline(preview.from, preview.to, { class: 'docs-ai-selection' }),
              Decoration.widget(preview.to, ghost, { key: 'docs-ai-ghost', side: 1 }),
            ])
          },
          handleKeyDown(_view, event): boolean {
            const preview = aiPluginKey.getState(editor.state)
            if (!preview) return false
            if (event.key === 'Escape') {
              editor.commands.aiReject()
              return true
            }
            if ((event.key === 'Enter' || event.key === 'Tab') && preview.status !== 'error') {
              event.preventDefault()
              editor.commands.aiAccept()
              return true
            }
            return false
          },
        },
      }),
    ]
  },

  // Mirror the PM plugin state into extension storage so Vue components
  // (BubbleMenu) can read it without importing the plugin key.
  onTransaction(this: { editor: Editor }): void {
    const storage = (this.editor.storage as unknown as { ai: AIStorage }).ai
    storage.preview = aiPluginKey.getState(this.editor.state) ?? null
  },

  onDestroy(this: { editor: Editor }): void {
    const storage = (this.editor.storage as unknown as { ai: AIStorage }).ai
    storage.abort?.abort()
    storage.abort = null
    storage.preview = null
  },
})

export const aiPlugin = definePlugin({
  id: 'ai',
  tiptapExtensions: [AIExtension],
})
