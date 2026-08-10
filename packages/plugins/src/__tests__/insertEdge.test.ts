import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createEditor } from '@kedata-indonesia/docflow-core'
import { defaultPlugins, insertMarkdownBlock } from '../index.js'

/** Reproduce the "Insert is stuck" report: collapsed cursor inside a
 *  NON-empty paragraph, then insert a markdown table — does it land or
 *  silently fail / throw? */
describe('insertMarkdownBlock — edge cases', () => {
  let inst: ReturnType<typeof createEditor> | null = null

  beforeEach(() => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    inst = createEditor({ target, plugins: defaultPlugins })
  })

  afterEach(() => {
    inst?.destroy()
    inst?.editor.view.dom.parentElement?.remove()
    inst = null
  })

  it('inserts a table at a collapsed cursor inside a NON-empty paragraph', () => {
    const editor = inst!.editor
    editor.commands.insertContent('Hello world')
    editor.commands.focus('end') // collapsed cursor at end of "Hello world"
    const from = editor.state.selection.from
    expect(editor.state.selection.empty).toBe(true)
    expect(editor.state.doc.firstChild!.textContent).toBe('Hello world')

    const md = '| A | B |\n|---|---|\n| 1 | 2 |'
    expect(() => insertMarkdownBlock(editor, editor.view, from, from, md)).not.toThrow()

    let tables = 0
    editor.state.doc.descendants((n) => {
      if (n.type.name === 'table') tables++
    })
    expect(tables).toBe(1)
    // The original prose survives (split around the table).
    expect(editor.state.doc.textBetween(0, editor.state.doc.content.size, ' ', ' ')).toContain('Hello world')
  })

  it('inserts plain prose at a collapsed cursor inside a NON-empty paragraph', () => {
    const editor = inst!.editor
    editor.commands.insertContent('Hello world')
    editor.commands.focus('end')
    const from = editor.state.selection.from

    const md = 'AI answer with **bold**.'
    expect(() => insertMarkdownBlock(editor, editor.view, from, from, md)).not.toThrow()
    const flat = editor.state.doc.textBetween(0, editor.state.doc.content.size, ' ', ' ')
    expect(flat).toContain('Hello world')
    expect(flat).toContain('AI answer with')
    // bold mark survived
    let hasBold = false
    editor.state.doc.descendants((n) => {
      n.marks.forEach((m) => {
        if (m.type.name === 'bold') hasBold = true
      })
    })
    expect(hasBold).toBe(true)
  })

  it('inserts when the EDITOR IS NOT FOCUSED (the real sidebar scenario)', () => {
    const editor = inst!.editor
    editor.commands.insertContent('Hello world')
    editor.commands.focus('end')
    const from = editor.state.selection.from
    // Blur: the AI sidebar calls handleInsert while the focus is in the
    // textarea, NOT the editor. The editor.view is not focused.
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    expect(document.activeElement).not.toBe(editor.view.dom)

    const md = '| A | B |\n|---|---|\n| 1 | 2 |'
    expect(() => insertMarkdownBlock(editor, editor.view, from, from, md)).not.toThrow()
    let tables = 0
    editor.state.doc.descendants((n) => {
      if (n.type.name === 'table') tables++
    })
    expect(tables).toBe(1)
  })
})