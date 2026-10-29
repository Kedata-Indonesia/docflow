import type { Editor } from '@tiptap/core'
import type { EditorState } from '@tiptap/pm/state'
import { Plugin } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { aiPluginKey, applyPreviewTransaction } from './pluginState.js'
import type { AIPreviewState } from './types.js'
import { createAIWidgets } from './widgets.js'

/**
 * The preview plugin: state lives in `aiPluginKey` (reducer in
 * `pluginState.ts`), rendering is decoration-only, and the accept/reject keys
 * are intercepted here so a preview can never be typed over.
 */
export function createAIPlugin(editor: Editor): Plugin<AIPreviewState | null> {
  const widgets = createAIWidgets(editor)

  return new Plugin<AIPreviewState | null>({
    key: aiPluginKey,
    state: {
      init: () => null,
      apply: (tr, prev) => applyPreviewTransaction(tr, prev),
    },
    props: {
      decorations(state: EditorState): DecorationSet {
        const preview = aiPluginKey.getState(state)
        if (!preview) {
          widgets.resetPromptWidget()
          return DecorationSet.empty
        }

        const decorations = []
        if (preview.mode === 'transform' && preview.to > preview.from) {
          decorations.push(
            Decoration.inline(preview.from, preview.to, { class: 'docs-ai-selection' }),
          )
        }
        if (preview.status === 'prompt') {
          const widget = widgets.getPromptWidget()
          decorations.push(
            Decoration.widget(preview.to, widget.dom, {
              key: 'docs-ai-prompt',
              side: 1,
              stopEvent: widget.stopEvent,
            }),
          )
        } else {
          widgets.resetPromptWidget()
          const ghost = widgets.buildGhostWidget(preview)
          decorations.push(
            Decoration.widget(preview.to, ghost.dom, {
              // The key MUST track the rendered content: prosemirror-view's
              // WidgetType.eq treats same-key widgets as identical and skips
              // the redraw — a constant key freezes the ghost at its first
              // paint (the "AI writing…" bug).
              key: `docs-ai-ghost-${preview.status}-${preview.text.length}-${(
                preview.error ?? ''
              ).length}`,
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
        // While the /ai input is open, editor keys behave normally (the input
        // handles Enter/Esc itself via stopEvent).
        if (preview.status === 'prompt') return false
        if ((event.key === 'Enter' || event.key === 'Tab') && preview.status !== 'error') {
          event.preventDefault()
          editor.commands.aiAccept()
          return true
        }
        return false
      },
    },
  })
}
