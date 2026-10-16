import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Editor as TiptapEditor } from '@tiptap/core'
import { createEditor } from '../Editor.js'
import {
  clampIndentLevel,
  indentLevelOf,
  INDENT_MAX_LEVEL,
  INDENT_STEP_PX,
  INDENT_STYLE_VAR,
} from '../Indent.js'

interface JsonNode {
  type: string
  attrs?: Record<string, unknown>
  content?: JsonNode[]
}

/**
 * Issue #189 — Tab / Shift-Tab block indentation.
 *
 * The keymap assertions go through `view.someProp('handleKeyDown')`, i.e. the
 * exact chain ProseMirror runs on a real keydown, so "Tab is handled" (focus
 * stays in the editor) is covered without faking DOM event plumbing.
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

function blocks(editor: TiptapEditor): JsonNode[] {
  return (editor.getJSON() as JsonNode).content ?? []
}

function countNodes(editor: TiptapEditor, type: string): number {
  let found = 0
  const walk = (nodes: JsonNode[]): void => {
    for (const node of nodes) {
      if (node.type === type) found++
      if (node.content) walk(node.content)
    }
  }
  walk(blocks(editor))
  return found
}

/** Put the caret inside the first text node whose content matches `text`. */
function cursorAtText(editor: TiptapEditor, text: string): void {
  let at = -1
  editor.state.doc.descendants((node, pos) => {
    if (at === -1 && node.isText && node.text === text) at = pos + 1
  })
  if (at === -1) throw new Error(`text not found in document: ${text}`)
  editor.commands.setTextSelection(at)
}

describe('IndentExtension (#189)', () => {
  let target: HTMLDivElement
  let instance: ReturnType<typeof createEditor>

  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    instance?.destroy()
    target.remove()
  })

  const mount = (content: string): TiptapEditor => {
    instance = createEditor({ target, content })
    return instance.editor
  }

  it('Tab indents the paragraph and Shift-Tab restores it', () => {
    const editor = mount('<p>Hello</p>')
    editor.commands.setTextSelection(2)

    expect(editor.commands.indent()).toBe(true)
    expect(blocks(editor)[0].attrs?.indent).toBe(1)
    expect(editor.getHTML()).toContain('data-indent="1"')
    expect(editor.getHTML()).toContain(`margin-left: ${INDENT_STEP_PX}px`)
    expect(editor.getHTML()).toContain(`${INDENT_STYLE_VAR}: 1`)

    expect(editor.commands.outdent()).toBe(true)
    expect(blocks(editor)[0].attrs?.indent).toBe(0)
    expect(editor.getHTML()).not.toContain('data-indent')
  })

  it('binds Tab and Shift-Tab through the keymap, so focus never escapes', () => {
    const editor = mount('<p>Hello</p>')
    editor.commands.setTextSelection(2)

    expect(pressTab(editor)).toBe(true)
    expect(blocks(editor)[0].attrs?.indent).toBe(1)

    expect(pressTab(editor, true)).toBe(true)
    expect(blocks(editor)[0].attrs?.indent).toBe(0)

    // Nothing left to outdent → the key is not claimed (the browser may then
    // move focus, which is the documented escape hatch).
    expect(pressTab(editor, true)).toBe(false)
  })

  it('clamps at INDENT_MAX_LEVEL and reports the no-op', () => {
    const editor = mount('<p>Hello</p>')
    editor.commands.setTextSelection(2)

    for (let i = 0; i < INDENT_MAX_LEVEL; i++) editor.commands.indent()

    expect(blocks(editor)[0].attrs?.indent).toBe(INDENT_MAX_LEVEL)
    expect(editor.commands.indent()).toBe(false)
    expect(blocks(editor)[0].attrs?.indent).toBe(INDENT_MAX_LEVEL)
  })

  it('indents every block covered by a range selection', () => {
    const editor = mount('<p>One</p><p>Two</p>')
    editor.commands.setTextSelection({ from: 2, to: 10 })

    expect(editor.commands.indent()).toBe(true)
    expect(blocks(editor).map((node) => node.attrs?.indent)).toEqual([1, 1])
  })

  it('nests a list item instead of indenting its text', () => {
    const editor = mount('<ul><li><p>One</p></li><li><p>Two</p></li></ul>')
    cursorAtText(editor, 'Two')

    expect(pressTab(editor)).toBe(true)
    expect(countNodes(editor, 'bulletList')).toBe(2)
    expect(countNodes(editor, 'listItem')).toBe(2)
    // The paragraph inside the item keeps its own indent untouched.
    expect(JSON.stringify(editor.getJSON())).toContain('"indent":0')
  })

  it('unnests a nested list item on Shift-Tab', () => {
    const editor = mount(
      '<ul><li><p>One</p></li><li><p>Two</p><ul><li><p>Deep</p></li></ul></li></ul>',
    )
    cursorAtText(editor, 'Deep')
    expect(countNodes(editor, 'bulletList')).toBe(2)

    expect(pressTab(editor, true)).toBe(true)
    expect(countNodes(editor, 'bulletList')).toBe(1)
  })

  it('indents inside a code block as literal whitespace, not as a block level', () => {
    const editor = mount('<pre><code>const a = 1</code></pre>')
    cursorAtText(editor, 'const a = 1')

    expect(pressTab(editor)).toBe(true)
    expect(editor.state.doc.textContent).toBe('\tconst a = 1')
    // codeBlock is not an indentable node — no level is set on the block.
    expect(blocks(editor)[0].attrs?.indent).toBeUndefined()

    expect(pressTab(editor, true)).toBe(true)
    expect(editor.state.doc.textContent).toBe('const a = 1')
  })

  it('reads the level back from data-indent and from margin-left', () => {
    const editor = mount(
      '<p data-indent="3">A</p><p style="margin-left: 96px">B</p><p style="margin-left: 0px">C</p>',
    )

    expect(blocks(editor).map((node) => node.attrs?.indent)).toEqual([3, 2, 0])
  })

  it('supports absolute levels and resetting them', () => {
    const editor = mount('<h2>Title</h2>')
    cursorAtText(editor, 'Title')

    expect(editor.commands.setIndent(4)).toBe(true)
    expect(blocks(editor)[0].attrs?.indent).toBe(4)

    expect(editor.commands.setIndent(99)).toBe(true)
    expect(blocks(editor)[0].attrs?.indent).toBe(INDENT_MAX_LEVEL)

    expect(editor.commands.unsetIndent()).toBe(true)
    expect(blocks(editor)[0].attrs?.indent).toBe(0)
  })

  it('exposes clamped level helpers', () => {
    const editor = mount('<p>Hello</p>')
    const paragraph = editor.state.doc.child(0)

    editor.commands.setTextSelection(2)
    editor.commands.setIndent(2)

    expect(clampIndentLevel(-3)).toBe(0)
    expect(clampIndentLevel(2.8)).toBe(2)
    expect(clampIndentLevel(Number.NaN)).toBe(0)
    expect(clampIndentLevel(INDENT_MAX_LEVEL + 5)).toBe(INDENT_MAX_LEVEL)
    expect(indentLevelOf(editor.state.doc.child(0))).toBe(2)
    expect(indentLevelOf(paragraph)).toBe(0)
  })
})
