import { Extension } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import type { EditorState } from '@tiptap/pm/state'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { definePlugin } from '@kedata-indonesia/docflow-core'
import type { AIAction, AIActionRequest, AIStreamFn } from '@kedata-indonesia/docflow-core'

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
 */

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

export const aiPluginKey = new PluginKey<AIPreviewState | null>('docflow-ai')

type AIMeta =
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

function getAIStreamPort(editor: Editor): AIStreamFn | undefined {
  return ((editor.storage as Record<string, unknown>).editorContext as EditorContextStorage | undefined)
    ?.aiStream
}

function boundedContext(state: EditorState, from: number, to: number): { before: string; after: string } {
  return {
    before: state.doc.textBetween(Math.max(0, from - CONTEXT_CHARS), from, '\n', ' '),
    after: state.doc.textBetween(to, Math.min(state.doc.content.size, to + CONTEXT_CHARS), '\n', ' '),
  }
}

/** Async streaming loop — pushes meta-only transactions; never touches the doc. */
function runAIStream(editor: Editor, req: AIActionRequest, abort: AbortController): void {
  const aiStream = getAIStreamPort(editor)
  if (!aiStream) return
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
}

function stopStream(editor: Editor): void {
  const storage = (editor.storage as unknown as { ai: AIStorage }).ai
  storage.abort?.abort()
  storage.abort = null
}

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
          ;(editor.storage as unknown as { ai: AIStorage }).ai.abort = abort
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
          ;(editor.storage as unknown as { ai: AIStorage }).ai.abort = abort
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
            // inserts at the collapsed position.
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
          stopStream(editor)
          dispatch?.(state.tr.setMeta(aiPluginKey, { type: 'clear' } satisfies AIMeta))
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    const editor = this.editor

    // Cached so decoration rebuilds (e.g. remote collab updates mapping the
    // position) reuse the same input DOM — its typed text and focus survive.
    let promptWidget: { dom: HTMLElement; stopEvent: (e: Event) => boolean } | null = null

    /** The /ai instruction input (7C) — a real <input> inside a widget. */
    function getPromptWidget(): { dom: HTMLElement; stopEvent: (e: Event) => boolean } {
      if (promptWidget) return promptWidget
      const wrap = document.createElement('span')
      wrap.className = 'docs-ai-prompt'
      const input = document.createElement('input')
      input.type = 'text'
      input.className = 'docs-ai-prompt__input'
      input.placeholder = 'Ask AI to write…  (Enter ⏎ · Esc cancel)'
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          editor.commands.aiPromptSubmit({ prompt: input.value })
        } else if (event.key === 'Escape') {
          event.preventDefault()
          editor.commands.aiReject()
        }
      })
      input.addEventListener('blur', () => {
        // Clicking away before submitting cancels — like Notion's /ai input.
        const preview = aiPluginKey.getState(editor.state)
        if (preview?.status === 'prompt') editor.commands.aiReject()
      })
      wrap.appendChild(input)
      // Focus after the decoration mounts.
      setTimeout(() => input.focus(), 0)
      promptWidget = { dom: wrap, stopEvent: (e) => e.target instanceof Node && wrap.contains(e.target) }
      return promptWidget
    }

    function buildGhostWidget(preview: AIPreviewState): {
      dom: HTMLElement
      stopEvent: (e: Event) => boolean
    } {
      const ghost = document.createElement('span')
      let actions: HTMLElement | null = null
      if (preview.status === 'error') {
        ghost.className = 'docs-ai-ghost docs-ai-ghost--error'
        ghost.textContent = ` ${preview.error ?? 'AI error'} — press Esc`
      } else {
        ghost.className = 'docs-ai-ghost'
        const textSpan = document.createElement('span')
        // Empty first paint would look like a broken box — say what's happening.
        if (!preview.text && preview.status === 'streaming') {
          textSpan.textContent = 'AI writing…'
          textSpan.className = 'docs-ai-ghost-placeholder'
        } else {
          textSpan.textContent = preview.text + (preview.status === 'streaming' ? '▌' : '')
        }
        ghost.appendChild(textSpan)
        if (preview.status === 'done') {
          // Clear affordance: clickable Accept/Reject + the keyboard hint.
          actions = document.createElement('span')
          actions.className = 'docs-ai-ghost-actions'

          const acceptBtn = document.createElement('button')
          acceptBtn.type = 'button'
          acceptBtn.className = 'docs-ai-ghost-btn docs-ai-ghost-btn--accept'
          acceptBtn.textContent = '✓ Accept'
          acceptBtn.title = 'Accept (Enter)'
          acceptBtn.addEventListener('mousedown', (e) => {
            e.preventDefault()
            editor.commands.aiAccept()
          })

          const rejectBtn = document.createElement('button')
          rejectBtn.type = 'button'
          rejectBtn.className = 'docs-ai-ghost-btn docs-ai-ghost-btn--reject'
          rejectBtn.textContent = '✗ Reject'
          rejectBtn.title = 'Reject (Esc)'
          rejectBtn.addEventListener('mousedown', (e) => {
            e.preventDefault()
            editor.commands.aiReject()
          })

          actions.appendChild(acceptBtn)
          actions.appendChild(rejectBtn)
          ghost.appendChild(actions)
        }
      }
      return {
        dom: ghost,
        // Keep button clicks away from ProseMirror (it would move the
        // selection and swallow the mousedown before our handler).
        stopEvent: (e) =>
          actions !== null && e.target instanceof Node && actions.contains(e.target),
      }
    }

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

            // Clicking/moving the cursor away while the /ai input is open
            // cancels it (the input's own blur handler covers pointer focus).
            if (prev.status === 'prompt' && tr.selectionSet) return null

            if (tr.docChanged) {
              if (prev.mode === 'generate') {
                // Collapsed position: just map it through the edit.
                const pos = tr.mapping.map(prev.from, 1)
                return { ...prev, from: pos, to: pos }
              }
              // Transform: someone (local or remote) edited while the preview
              // is active — map the range, and cancel conservatively if the
              // text under it no longer matches what we captured.
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
            if (!preview) {
              promptWidget = null
              return DecorationSet.empty
            }

            const decorations = []
            if (preview.mode === 'transform' && preview.to > preview.from) {
              decorations.push(
                Decoration.inline(preview.from, preview.to, { class: 'docs-ai-selection' }),
              )
            }
            if (preview.status === 'prompt') {
              const widget = getPromptWidget()
              decorations.push(
                Decoration.widget(preview.to, widget.dom, {
                  key: 'docs-ai-prompt',
                  side: 1,
                  stopEvent: widget.stopEvent,
                }),
              )
            } else {
              promptWidget = null
              const ghost = buildGhostWidget(preview)
              decorations.push(
                Decoration.widget(preview.to, ghost.dom, {
                  // The key MUST track the rendered content: prosemirror-view's
                  // WidgetType.eq treats same-key widgets as identical and skips
                  // the redraw — a constant key freezes the ghost at its first
                  // paint (the "AI writing…" bug).
                  key: `docs-ai-ghost-${preview.status}-${preview.text.length}-${(preview.error ?? '').length}`,
                  side: 1,
                  stopEvent: ghost.stopEvent,
                }),
              )
            }
            return DecorationSet.create(state.doc, decorations)
          },
          handleKeyDown(_view, event): boolean {
            const preview = aiPluginKey.getState(editor.state)
            if (!preview) return false
            if (event.key === 'Escape') {
              editor.commands.aiReject()
              return true
            }
            // While the /ai input is open, editor keys behave normally (the
            // input handles Enter/Esc itself via stopEvent).
            if (preview.status === 'prompt') return false
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
  slashCommands: [{ name: 'AI', description: 'Generate text with AI', command: 'aiGenerate' }],
})
