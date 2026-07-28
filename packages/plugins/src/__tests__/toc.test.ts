import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createEditor } from '@kedata-indonesia/docflow-core'
import { defaultPlugins } from '../index.js'

describe('toc plugin', () => {
  let editorInstance: ReturnType<typeof createEditor>

  beforeEach(() => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    editorInstance = createEditor({ target, plugins: defaultPlugins })
  })

  afterEach(() => {
    editorInstance.destroy()
    editorInstance.editor.view.dom.parentElement?.remove()
  })

  it('registers the toc and tocEntry nodes in the schema', () => {
    expect(editorInstance.editor.schema.nodes.toc).toBeDefined()
    expect(editorInstance.editor.schema.nodes.tocEntry).toBeDefined()
  })

  it('insertToc inserts a toc node prefilled with entries for the current headings', () => {
    const { editor } = editorInstance
    editor.commands.setContent('<h1>Intro</h1><h2>Details</h2><h4>Skipped</h4><p>Body</p>')
    editor.commands.focus('end')

    const result = editor.commands.insertToc()
    expect(result).toBe(true)

    const toc = editor.getJSON().content?.find((n) => n.type === 'toc')
    expect(toc).toBeDefined()
    // H1–H3 only; the H4 is not listed (sidebar parity).
    expect(toc?.content?.map((e) => e.attrs?.level)).toEqual([1, 2])
    expect(toc?.content?.map((e) => e.content?.[0]?.text)).toEqual(['Intro', 'Details'])
    // Each entry carries the heading's doc position for click-to-jump.
    expect(toc?.content?.every((e) => typeof e.attrs?.pos === 'number')).toBe(true)
  })

  it('refreshToc rewrites entries to match edited headings', () => {
    const { editor } = editorInstance
    editor.commands.setContent('<h1>Intro</h1><p>Body</p>')
    editor.commands.focus('end')
    editor.commands.insertToc()

    // Edit the heading text (pos 1 is the start of the h1's text).
    const { state, view } = editor
    view.dispatch(state.tr.insertText('Updated ', 1))

    // Stale until refreshed.
    let toc = editor.getJSON().content?.find((n) => n.type === 'toc')
    expect(toc?.content?.[0]?.content?.[0]?.text).toBe('Intro')

    const result = editor.commands.refreshToc()
    expect(result).toBe(true)

    toc = editor.getJSON().content?.find((n) => n.type === 'toc')
    expect(toc?.content?.[0]?.content?.[0]?.text).toBe('Updated Intro')
  })

  it('keeps entry paragraphs in getJSON (export invariant)', () => {
    const { editor } = editorInstance
    editor.commands.setContent('<h1>Intro</h1><h2>Details</h2>')
    editor.commands.focus('end')
    editor.commands.insertToc()

    const toc = editor.getJSON().content?.find((n) => n.type === 'toc')
    expect(toc?.content).toHaveLength(2)
    expect(toc?.content?.[0]?.content?.[0]).toEqual({ type: 'text', text: 'Intro' })

    // HTML serialization (copy-paste / export) carries the block and entries.
    const html = editor.getHTML()
    expect(html).toContain('data-toc')
    expect(html).toContain('data-toc-entry')
    expect(html).toContain('Intro')
    expect(html).toContain('Details')
  })

  it('renders entries without page numbers in pageless mode', () => {
    const { editor } = editorInstance
    editor.commands.setContent('<h1>Intro</h1><p>Body</p>')
    // Pageless mode = PaginationPlus disabled (DocsEditor.applyPageless does
    // the same). Decorations rebuild on the next transaction and the
    // [data-rm-pagination] wrapper disappears from the DOM.
    editor.commands.disablePagination()
    editor.view.dispatch(editor.state.tr)
    expect(editor.view.dom.querySelector('[data-rm-pagination]')).toBeNull()

    editor.commands.focus('end')
    editor.commands.insertToc()

    const toc = editor.getJSON().content?.find((n) => n.type === 'toc')
    expect(toc).toBeDefined()
    for (const entry of toc?.content ?? []) {
      expect(entry.content?.some((c) => c.type === 'tocPageNum') ?? false).toBe(false)
    }
    expect(editor.getHTML()).not.toContain('docs-toc__page')

    // PaginationPlus keeps module-level options — re-enable so the disabled
    // state doesn't leak into the next test's editor instance.
    editor.commands.enablePagination()
  })

  it('captures page numbers when pagination breakers are present', () => {
    const { editor } = editorInstance
    editor.commands.setContent('<h1>Intro</h1><h2>Details</h2>')

    // jsdom reports all geometry as 0, so every heading resolves past all
    // breakers → page = number of breakers + 1 (same math as updatePageStats).
    const breakerCount = editor.view.dom.querySelectorAll('[data-rm-pagination] .rm-page-break .breaker').length
    expect(breakerCount).toBeGreaterThan(0)

    editor.commands.focus('end')
    editor.commands.insertToc()

    const toc = editor.getJSON().content?.find((n) => n.type === 'toc')
    const pages = toc?.content?.map(
      (e) => e.content?.find((c) => c.type === 'tocPageNum')?.attrs?.page,
    )
    expect(pages).toEqual([breakerCount + 1, breakerCount + 1])

    // The number is real serialized text — visible in export without CSS.
    const html = editor.getHTML()
    expect(html).toContain('docs-toc__page')
    expect(html).toContain(`>${breakerCount + 1}</span>`)
  })
})
