import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createEditor } from '@kedata-indonesia/docflow-core'
import { defaultPlugins, markdownToFragment, insertMarkdownBlock } from '../index.js'

/** Guards the markdown bridge behind the AI insert path (issue: AI tables
 *  landed as literal `| col |` text because `insertText`/`schema.text` were
 *  used instead of a schema-aware parse). */
describe('markdownInsert', () => {
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

  it('exposes the tiptap-markdown parser on editor.storage.markdown', () => {
    const storage = (inst!.editor.storage as Record<string, unknown>).markdown as
      { parser: { parse: (s: string, o?: { inline?: boolean }) => unknown } } | undefined
    expect(storage).toBeDefined()
    expect(typeof storage!.parser.parse).toBe('function')
  })

  it('parses a GFM table into a Fragment containing a real table node', () => {
    const editor = inst!.editor
    const md =
      '| Task | Description |\n|------|-------------|\n| Plan | Define scope |\n| Build | Execute plan |'
    const fragment = markdownToFragment(editor, md, { inline: false })
    expect(fragment).not.toBeNull()
    let tables = 0
    let rows = 0
    let headers = 0
    fragment!.forEach((node) => {
      if (node.type.name === 'table') {
        tables++
        node.forEach((row) => {
          rows++
          row.forEach((cell) => {
            if (cell.type.name === 'tableHeader') headers++
          })
        })
      }
    })
    expect(tables).toBe(1)
    expect(rows).toBe(3) // header + 2 body rows
    expect(headers).toBe(2) // 2 header cells
  })

  it('parses a heading + list + bold as block nodes (not literal text)', () => {
    const editor = inst!.editor
    const md = '# Title\n\n- one\n- two\n\nSome **bold** text.'
    const fragment = markdownToFragment(editor, md, { inline: false })
    expect(fragment).not.toBeNull()
    let headings = 0
    let bulletLists = 0
    let hasBold = false
    fragment!.forEach((node) => {
      if (node.type.name === 'heading') headings++
      if (node.type.name === 'bulletList') bulletLists++
      node.descendants((n) => {
        n.marks.forEach((m) => {
          if (m.type.name === 'bold') hasBold = true
        })
      })
    })
    expect(headings).toBe(1)
    expect(bulletLists).toBe(1)
    expect(hasBold).toBe(true)
  })

  it('inline parse unwraps the leading paragraph (for inline /ai transforms)', () => {
    const editor = inst!.editor
    const fragment = markdownToFragment(editor, 'plain **inline** text', { inline: true })!
    let hasParagraph = false
    let hasBold = false
    fragment.forEach((n) => {
      if (n.type.name === 'paragraph') hasParagraph = true
      n.marks.forEach((m) => {
        if (m.type.name === 'bold') hasBold = true
      })
    })
    // inline:true suppressed the wrapping paragraph; the bold mark survived.
    expect(hasParagraph).toBe(false)
    expect(hasBold).toBe(true)
  })

  it('insertMarkdownBlock inserts a table into the document via one transaction', () => {
    const editor = inst!.editor
    const view = editor.view
    const md = '| A | B |\n|---|---|\n| 1 | 2 |'
    insertMarkdownBlock(editor, view, 1, 1, md)
    let tables = 0
    editor.state.doc.descendants((n) => {
      if (n.type.name === 'table') tables++
    })
    expect(tables).toBe(1)
    const flat = editor.state.doc.textBetween(0, editor.state.doc.content.size, ' ', ' ')
    expect(flat).toContain('A')
    expect(flat).toContain('B')
    // No literal pipe+dash separator row leaks into the prose.
    expect(flat).not.toMatch(/\| A \||---/)
  })

  it('insertMarkdownBlock replaces an empty paragraph at a collapsed cursor', () => {
    const editor = inst!.editor
    // default doc is ONE empty paragraph; cursor is collapsed inside it.
    expect(editor.state.doc.childCount).toBe(1)
    insertMarkdownBlock(editor, editor.view, 1, 1, '# Heading\n\nbody')
    // The original empty paragraph is GONE — replaced by heading + paragraph.
    expect(editor.state.doc.childCount).toBe(2)
    expect(editor.state.doc.firstChild!.type.name).toBe('heading')
  })
})