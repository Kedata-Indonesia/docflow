import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createEditor } from '@kedata-indonesia/docflow-core'
import { defaultPlugins } from '../index.js'

/**
 * Regression for #23: `GoogleDocsHighlight` used `{ tag: 'span', style:
 * 'background-color' }`. ProseMirror treats a rule with `tag` as a tag rule and
 * ignores `style`, and mark rules run before node rules — so that bare `span`
 * rule matched EVERY `<span>`, shadowing custom node rules (`span[data-toc-page]`)
 * and downgrading them to highlight text on load.
 *
 * The rule is now `span[style*=background-color]`, which only matches spans that
 * actually carry an inline background colour.
 */
describe('#23 GoogleDocsHighlight span parsing', () => {
  let editorInstance: ReturnType<typeof createEditor>

  const highlightMarksOn = (text: string) => {
    const marks: string[] = []
    editorInstance.editor.state.doc.descendants((node) => {
      if (node.isText && node.text === text) {
        for (const mark of node.marks) marks.push(mark.type.name)
      }
      return undefined
    })
    return marks
  }

  beforeEach(() => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    editorInstance = createEditor({ target, plugins: defaultPlugins })
  })

  afterEach(() => {
    editorInstance.destroy()
    editorInstance.editor.view.dom.parentElement?.remove()
  })

  it('still parses a Google Docs background-color span as a highlight', () => {
    editorInstance.editor.commands.setContent(
      '<p><span style="background-color: #ffff00">Important</span></p>',
    )
    const marks: string[] = []
    const colors: unknown[] = []
    editorInstance.editor.state.doc.descendants((node) => {
      if (node.isText && node.text === 'Important') {
        for (const mark of node.marks) {
          marks.push(mark.type.name)
          if (mark.type.name === 'highlight') colors.push(mark.attrs.color)
        }
      }
      return undefined
    })
    expect(marks).toContain('highlight')
    // The inline colour is read from the style value, not lost to a default yellow.
    expect(colors[0]).toBeTruthy()
  })

  it('does not steal a plain <span> (regression: bare tag rule highlighted everything)', () => {
    editorInstance.editor.commands.setContent('<p><span>plain text</span></p>')
    expect(highlightMarksOn('plain text')).not.toContain('highlight')
  })

  it('keeps a custom span node (tocPageNum) parseable', () => {
    const { editor } = editorInstance
    // The TOC renders page numbers as <span data-toc-page>; the node rule must
    // win over any highlight rule.
    editor.commands.setContent('<p>page <span data-toc-page data-page="3">3</span></p>')

    const para = editor.getJSON().content?.[0]
    expect(para?.content?.some((c) => c.type === 'tocPageNum')).toBe(true)
    expect(highlightMarksOn('3')).not.toContain('highlight')

    // Round-trip through serialization the way a document is reloaded.
    const html = editor.getHTML()
    expect(html).toContain('data-toc-page')
    editor.commands.setContent(html)
    let tocPageNums = 0
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'tocPageNum') tocPageNums++
      return undefined
    })
    expect(tocPageNums).toBe(1)
  })
})
