import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { TextSelection } from '@tiptap/pm/state'
import { createEditor } from '../Editor.js'
import {
  posFromTextOffset,
  resolvePosFromNativePoint,
  interceptPaginationMouseDown,
} from '../pagination/PaginationCaretFix.js'

const CONTENT = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Hello world again.' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Second line here.' }] },
  ],
}

const PARA0_TEXT_LENGTH = 18 // 'Hello world again.'
const PARA0_SIZE = PARA0_TEXT_LENGTH + 2 // paragraph adds 2 boundary positions

interface MockCaretRange {
  startContainer: Node
  startOffset: number
}

// happy-dom does not implement document.caretRangeFromPoint; install an own
// configurable copy so the fix path can be exercised (mirrors the real API).
const withMockCaretFromPoint = (range: MockCaretRange) => {
  Object.defineProperty(document, 'caretRangeFromPoint', {
    configurable: true,
    value: () => range as unknown as Range,
  })
}

const withoutMockCaretFromPoint = () => {
  delete (document as unknown as Partial<Record<string, unknown>>).caretRangeFromPoint
}

describe('PaginationCaretFix', () => {
  let target: HTMLDivElement
  let instance: ReturnType<typeof createEditor>

  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
    instance = createEditor({ target, content: CONTENT, plugins: [] })
    // Activate the pagination DOM contract exactly like PaginationPlus.onCreate().
    instance.editor.view.dom.classList.add('rm-with-pagination')
    instance.editor.view.dom.removeAttribute('rm-pagination-disabled')
  })

  afterEach(() => {
    withoutMockCaretFromPoint()
    instance?.destroy()
    target.remove()
  })

  const textNodeOf = (paragraphIndex: number): Text => {
    const paragraphs = instance.editor.view.dom.querySelectorAll('p')
    const text = paragraphs[paragraphIndex].firstChild as Text
    expect(text.nodeType).toBe(Node.TEXT_NODE)
    return text
  }

  const mouseDown = (overrides: Partial<MouseEventInit> = {}): MouseEvent => {
    return new MouseEvent('mousedown', {
      button: 0,
      detail: 1,
      clientX: 10,
      clientY: 10,
      bubbles: true,
      cancelable: true,
      ...overrides,
    })
  }

  describe('posFromTextOffset', () => {
    it('maps a text node + offset to the correct doc position', () => {
      const node = textNodeOf(0)
      // Paragraph content starts at pos 1; offset 6 → 'w' at pos 7.
      expect(posFromTextOffset(instance.editor.view, node, 6)).toBe(7)
    })

    it('clamps offset beyond the text length', () => {
      const node = textNodeOf(0)
      expect(posFromTextOffset(instance.editor.view, node, 999)).toBe(1 + node.length)
    })

    it('returns null for a non-text node', () => {
      const paragraph = instance.editor.view.dom.querySelector('p') as Node
      expect(posFromTextOffset(instance.editor.view, paragraph, 0)).toBeNull()
    })
  })

  describe('resolvePosFromNativePoint', () => {
    it('uses caretRangeFromPoint when the document exposes it', () => {
      const node = textNodeOf(1)
      withMockCaretFromPoint({ startContainer: node, startOffset: 7 })

      // Para 0 spans [0, PARA0_SIZE); para 1 content starts right after it.
      const para1TextStart = PARA0_SIZE + 1
      const pos = resolvePosFromNativePoint(instance.editor.view, 10, 10)
      expect(pos).toBe(para1TextStart + 7)
    })

    it('returns null when caretRangeFromPoint is unavailable', () => {
      expect(resolvePosFromNativePoint(instance.editor.view, 10, 10)).toBeNull()
    })
  })

  describe('interceptPaginationMouseDown', () => {
    it('places the caret at the clicked text position and handles the click', () => {
      const view = instance.editor.view
      withMockCaretFromPoint({ startContainer: textNodeOf(0), startOffset: 6 })

      const handled = interceptPaginationMouseDown(view, mouseDown())

      expect(handled).toBe(true)
      const sel = view.state.selection
      expect(sel.empty).toBe(true)
      expect(sel.from).toBe(7) // native-mapped 'w' of "Hello world again."
    })

    it('tracks a drag after the intercepted click (collapsed → extended selection)', () => {
      const view = instance.editor.view
      withMockCaretFromPoint({ startContainer: textNodeOf(0), startOffset: 6 })
      expect(interceptPaginationMouseDown(view, mouseDown())).toBe(true)

      // User drags further into the same paragraph → offset 13 (pos 14).
      withMockCaretFromPoint({ startContainer: textNodeOf(0), startOffset: 13 })
      const para = textNodeOf(0).parentElement as HTMLElement
      para.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 10, bubbles: true }))

      const sel = view.state.selection
      expect(sel.empty).toBe(false)
      expect(sel.from).toBe(7)
      expect(sel.to).toBe(14)

      // Releasing the button cleans up: later moves no longer change selection.
      para.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
      withMockCaretFromPoint({ startContainer: textNodeOf(0), startOffset: 15 })
      para.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 10, bubbles: true }))
      expect(view.state.selection.to).toBe(14)
    })

    it('falls through (false) when the click is not on editable text', () => {
      expect(interceptPaginationMouseDown(instance.editor.view, mouseDown())).toBe(false)
    })

    it('falls through (false) for double clicks (detail > 1)', () => {
      const view = instance.editor.view
      withMockCaretFromPoint({ startContainer: textNodeOf(0), startOffset: 6 })
      expect(interceptPaginationMouseDown(view, mouseDown({ detail: 2 }))).toBe(false)
    })

    it('falls through (false) for modifier clicks', () => {
      const view = instance.editor.view
      withMockCaretFromPoint({ startContainer: textNodeOf(0), startOffset: 6 })
      expect(interceptPaginationMouseDown(view, mouseDown({ shiftKey: true }))).toBe(false)
    })

    it('falls through (false) when pagination is disabled', () => {
      const view = instance.editor.view
      view.dom.setAttribute('rm-pagination-disabled', '')
      withMockCaretFromPoint({ startContainer: textNodeOf(0), startOffset: 6 })
      expect(interceptPaginationMouseDown(view, mouseDown())).toBe(false)
    })

    it('falls through (false) when the editor is read-only', () => {
      const view = instance.editor.view
      view.dom.setAttribute('contenteditable', 'false')
      withMockCaretFromPoint({ startContainer: textNodeOf(0), startOffset: 6 })
      expect(interceptPaginationMouseDown(view, mouseDown())).toBe(false)
    })

    it('handles clicks even when ProseMirror was already correct', () => {
      const view = instance.editor.view
      withMockCaretFromPoint({ startContainer: textNodeOf(0), startOffset: 6 })

      // Select the whole paragraph, then plain-click again mid-paragraph.
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)))
      expect(interceptPaginationMouseDown(view, mouseDown())).toBe(true)
      expect(view.state.selection.empty).toBe(true)
      expect(view.state.selection.from).toBe(7)
    })
  })

  it('registers the paginationCaretFix extension on the editor', () => {
    expect(
      instance.editor.extensionManager.extensions.some((ext) => ext.name === 'paginationCaretFix'),
    ).toBe(true)
  })
})
