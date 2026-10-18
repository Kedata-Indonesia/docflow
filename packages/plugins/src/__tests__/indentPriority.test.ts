import { describe, it, expect, afterEach } from 'vitest'
import type { Editor as TiptapEditor } from '@tiptap/core'
import { createEditor } from '@kedata-indonesia/docflow-core'
import { tablePlugin } from '../index.js'

/**
 * Issue #189 / #197 item 3 — Tab ordering must stay "table → block indent".
 *
 * The e2e spec covers this through the playground, but CI does not run
 * Playwright. This test drives the same keydown chain (`someProp`) against a
 * real table extension, so a future priority change fails `pnpm test:unit`.
 */

function pressTab(editor: TiptapEditor, shiftKey = false): boolean {
  const event = new KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey,
    bubbles: true,
    cancelable: true,
  })
  return editor.view.someProp('handleKeyDown', (handler) => handler(editor.view, event)) === true
}

function cursorAtText(editor: TiptapEditor, text: string): void {
  let at = -1
  editor.state.doc.descendants((node, pos) => {
    if (at === -1 && node.isText && node.text === text) at = pos + 1
  })
  if (at === -1) throw new Error(`text not found in document: ${text}`)
  editor.commands.setTextSelection(at)
}

describe('Tab priority with tables (#189)', () => {
  let target: HTMLDivElement | undefined
  let instance: ReturnType<typeof createEditor> | undefined

  afterEach(() => {
    instance?.destroy()
    target?.remove()
    instance = undefined
    target = undefined
  })

  it('moves to the next cell instead of indenting the cell paragraph', () => {
    target = document.createElement('div')
    document.body.appendChild(target)
    instance = createEditor({
      target,
      content: '<table><tbody><tr><td><p>A</p></td><td><p>B</p></td></tr></tbody></table>',
      plugins: [tablePlugin],
    })
    const editor = instance.editor
    cursorAtText(editor, 'A')

    expect(pressTab(editor)).toBe(true)
    // TipTap's `goToNextCell` claimed the key, so the caret is in cell B.
    expect(editor.state.selection.$from.parent.textContent).toBe('B')

    // The block-indent fallback must not have run on either cell paragraph.
    const levels: unknown[] = []
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'paragraph') levels.push(node.attrs.indent)
    })
    expect(levels).toEqual([0, 0])
  })
})
