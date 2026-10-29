import type { NodeViewRenderer } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { scrollEditorToPos } from '../editorScroll.js'
import { regenerateToc } from './tocContent.js'

/**
 * NodeView chrome for a `toc` block: a caption, a refresh button and
 * click-to-jump on entries. The entry paragraphs stay real content, so the
 * `contentDOM` is the only editable part.
 */
export function createTocNodeView(): NodeViewRenderer {
  return (props) => {
    const editor = props.editor

    const dom = document.createElement('div')
    dom.className = 'docs-toc'
    dom.setAttribute('data-toc', '')

    const chrome = document.createElement('div')
    chrome.className = 'docs-toc__chrome'
    chrome.contentEditable = 'false'

    const caption = document.createElement('span')
    caption.className = 'docs-toc__caption'
    caption.textContent = 'Table of contents'

    const refresh = document.createElement('button')
    refresh.type = 'button'
    refresh.className = 'docs-toc__refresh'
    refresh.title = 'Refresh table of contents'
    refresh.textContent = '⟳'

    chrome.appendChild(caption)
    chrome.appendChild(refresh)

    const contentDOM = document.createElement('div')
    contentDOM.className = 'docs-toc__entries'

    dom.appendChild(chrome)
    dom.appendChild(contentDOM)

    const onRefresh = (event: MouseEvent) => {
      event.preventDefault()
      regenerateToc(editor)
    }
    // Click an entry → jump to its heading. Positions were captured at
    // generation time and may be stale between refreshes — `scrollEditorToPos`
    // clamps to the doc size (so a stale pos can never throw) and scrolls the
    // paginated surface (`.docs-editor-scroll`), which a plain
    // `scrollIntoView()` could not do once the page frames were cloned.
    const onEntryClick = (event: MouseEvent) => {
      const entry = (event.target as HTMLElement | null)?.closest?.('[data-toc-entry]')
      if (!entry) return
      const pos = Number((entry as HTMLElement).getAttribute('data-pos') ?? 0)
      scrollEditorToPos(editor, pos)
    }

    refresh.addEventListener('click', onRefresh)
    dom.addEventListener('click', onEntryClick)

    return {
      dom,
      contentDOM,
      update(updatedNode: PMNode): boolean {
        return updatedNode.type.name === 'toc'
      },
      destroy() {
        refresh.removeEventListener('click', onRefresh)
        dom.removeEventListener('click', onEntryClick)
      },
    }
  }
}
