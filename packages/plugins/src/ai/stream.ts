import type { Editor } from '@tiptap/core'
import type { EditorState } from '@tiptap/pm/state'
import type { AIActionRequest, AIStreamFn } from '@kedata-indonesia/docflow-core'
import { aiPluginKey } from './pluginState.js'
import type { AIMeta, AIPreviewState, AIStorage, EditorContextStorage } from './types.js'

/** Bounded surrounding text sent to the server — never the whole document. */
const CONTEXT_CHARS = 1500

export function getAIPreview(editor: Editor): AIPreviewState | null {
  const storage = (editor.storage as unknown as Record<string, unknown>).ai
  return storage ? ((storage as AIStorage).preview ?? null) : null
}

export function getAIStreamPort(editor: Editor): AIStreamFn | undefined {
  return (
    (editor.storage as unknown as Record<string, unknown>).editorContext as
      | EditorContextStorage
      | undefined
  )?.aiStream
}

export function boundedContext(
  state: EditorState,
  from: number,
  to: number,
): { before: string; after: string } {
  const docEnd = state.doc.content.size
  const contextStart = Math.max(0, from - CONTEXT_CHARS)
  const contextEnd = Math.min(docEnd, to + CONTEXT_CHARS)
  return {
    before: state.doc.textBetween(contextStart, from, '\n', ' '),
    after: state.doc.textBetween(to, contextEnd, '\n', ' '),
  }
}

/** Async streaming loop — pushes meta-only transactions; never touches the doc. */
export function runAIStream(editor: Editor, req: AIActionRequest, abort: AbortController): void {
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
    } catch (error) {
      push({
        type: 'error',
        message: error instanceof Error ? error.message : 'AI request failed',
      })
    }
  })()
}

export function stopStream(editor: Editor): void {
  const storage = (editor.storage as unknown as { ai: AIStorage }).ai
  storage.abort?.abort()
  storage.abort = null
}
