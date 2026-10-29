import type { Editor } from '@tiptap/core'
import { aiPluginKey } from './pluginState.js'
import type { AIPreviewState } from './types.js'

/** A widget DOM node plus the ProseMirror stopEvent predicate it needs. */
export interface AIWidget {
  dom: HTMLElement
  stopEvent: (event: Event) => boolean
}

export interface AIWidgets {
  getPromptWidget: () => AIWidget
  buildGhostWidget: (preview: AIPreviewState) => AIWidget
  resetPromptWidget: () => void
}

/**
 * Widget factories for the two decorations: the /ai instruction input (7C) and
 * the ghost preview with its Accept/Reject controls. The prompt input is cached
 * so decoration rebuilds (e.g. remote collab updates mapping the position)
 * reuse the same DOM — its typed text and focus survive.
 */
export function createAIWidgets(editor: Editor): AIWidgets {
  let promptWidget: AIWidget | null = null

  function getPromptWidget(): AIWidget {
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
    promptWidget = { dom: wrap, stopEvent: (event) => event.target instanceof Node && wrap.contains(event.target) }
    return promptWidget
  }

  function buildGhostWidget(preview: AIPreviewState): AIWidget {
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
        acceptBtn.addEventListener('mousedown', (event) => {
          event.preventDefault()
          editor.commands.aiAccept()
        })

        const rejectBtn = document.createElement('button')
        rejectBtn.type = 'button'
        rejectBtn.className = 'docs-ai-ghost-btn docs-ai-ghost-btn--reject'
        rejectBtn.textContent = '✗ Reject'
        rejectBtn.title = 'Reject (Esc)'
        rejectBtn.addEventListener('mousedown', (event) => {
          event.preventDefault()
          editor.commands.aiReject()
        })

        actions.appendChild(acceptBtn)
        actions.appendChild(rejectBtn)
        ghost.appendChild(actions)
      }
    }
    return {
      dom: ghost,
      // Keep button clicks away from ProseMirror (it would move the selection
      // and swallow the mousedown before our handler).
      stopEvent: (event) =>
        actions !== null && event.target instanceof Node && actions.contains(event.target),
    }
  }

  return {
    getPromptWidget,
    buildGhostWidget,
    resetPromptWidget: () => {
      promptWidget = null
    },
  }
}
