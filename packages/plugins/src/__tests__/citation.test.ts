import { describe, it, expect, afterEach, vi } from 'vitest'
import { createEditor } from '@kedata-indonesia/docflow-core'
import type { CslItemData } from '@kedata-indonesia/docflow-core'
import { citationPlugin } from '../citation.js'
import { footnotePlugin } from '../footnote.js'
import { getCitationEngine } from '../citation.js'

const bookDoe: CslItemData = {
  id: 'doe-2020',
  type: 'book',
  title: 'The Design of Tests',
  author: [{ family: 'Doe', given: 'John' }],
  issued: { 'date-parts': [[2020]] },
  publisher: 'Test Press',
  'publisher-place': 'Jakarta',
}

const plugins = [footnotePlugin, citationPlugin]

function makeEditor(extra: Record<string, unknown> = {}) {
  const target = document.createElement('div')
  document.body.appendChild(target)
  const instance = createEditor({ target, plugins, ...extra })
  return { instance, target }
}

interface JsonNode {
  type?: string
  attrs?: { citationId?: string; sourceId?: string }
  content?: JsonNode[]
}

/** First citation cluster id found in the document (inline citation or citation-backed footnote). */
function firstCitationId(instance: ReturnType<typeof createEditor>): string {
  const walk = (nodes: JsonNode[] | undefined): string => {
    for (const node of nodes ?? []) {
      if ((node.type === 'citation' || node.type === 'footnote') && node.attrs?.citationId) {
        return node.attrs.citationId
      }
      const nested = walk(node.content)
      if (nested) return nested
    }
    return ''
  }
  return walk((instance.editor.getJSON() as JsonNode).content)
}

describe('citation plugin (T2)', () => {
  let cleanup: (() => void) | null = null

  afterEach(() => {
    cleanup?.()
    cleanup = null
  })

  it('is inert without the injected CitationPort (no engine, no crash)', () => {
    const { instance, target } = makeEditor()
    cleanup = () => { instance.destroy(); target.remove() }

    expect(getCitationEngine(instance.editor)).toBeNull()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(instance.pluginActions.insertCitation()).toBe(false)
    warn.mockRestore()
  })

  it('creates the engine from the injected port and inserts an in-text citation (APA)', () => {
    const onSourcesChange = vi.fn()
    const { instance, target } = makeEditor({
      citation: { sources: [bookDoe], style: 'apa', onSourcesChange },
    })
    cleanup = () => { instance.destroy(); target.remove() }

    const engine = getCitationEngine(instance.editor)
    expect(engine).not.toBeNull()
    expect(engine?.getStyle()).toBe('apa')

    instance.editor.commands.focus()
    const result = instance.pluginActions.insertCitation({ sourceId: 'doe-2020' })
    expect(result).toBe(true)

    const json = instance.editor.getJSON() as { content?: Array<{ content?: Array<{ type: string; attrs?: Record<string, unknown> }> }> }
    const inline = json.content?.[0]?.content?.find((n) => n.type === 'citation')
    expect(inline).toBeTruthy()
    expect(inline?.attrs?.sourceId).toBe('doe-2020')
    expect(inline?.attrs?.citationId).toBeTruthy()
  })

  it('never persists rendered text — nodes store references only', async () => {
    const { instance, target } = makeEditor({ citation: { sources: [bookDoe], style: 'apa' } })
    cleanup = () => { instance.destroy(); target.remove() }

    instance.editor.commands.focus()
    instance.pluginActions.insertCitation({ sourceId: 'doe-2020' })
    await vi.waitFor(() => {
      expect(getCitationEngine(instance.editor)?.renderCluster(firstCitationId(instance))).toContain('Doe')
    })

    const raw = JSON.stringify(instance.editor.getJSON())
    // The formatted citation text must NOT be in the document JSON.
    expect(raw).not.toContain('(Doe')
    expect(raw).toContain('"sourceId":"doe-2020"')
  })

  it('inserts a citation-backed footnote in note styles (Chicago notes-bib)', () => {
    const { instance, target } = makeEditor({
      citation: { sources: [bookDoe], style: 'chicago-notes-bibliography' },
    })
    cleanup = () => { instance.destroy(); target.remove() }

    instance.editor.commands.focus()
    const result = instance.pluginActions.insertCitation({ sourceId: 'doe-2020', locator: '12' })
    expect(result).toBe(true)

    const raw = JSON.stringify(instance.editor.getJSON())
    expect(raw).toContain('"type":"footnote"')
    expect(raw).toContain('"sourceId":"doe-2020"')
    expect(raw).toContain('"locator":"12"')
    // Citation-backed footnotes persist the engine's rendered text so they
    // survive document reloads — same persistence model as typed footnotes.
    expect(raw).toContain('Doe')
    expect(raw).not.toContain('"content":""')
  })

  it('round-trips citation/bibliography attrs through getJSON + setContent', async () => {
    const { instance, target } = makeEditor({ citation: { sources: [bookDoe], style: 'apa' } })
    cleanup = () => { instance.destroy(); target.remove() }

    instance.editor.commands.focus()
    instance.pluginActions.insertCitation({ sourceId: 'doe-2020' })
    instance.editor.commands.focus('end')
    instance.pluginActions.insertBibliography()

    const json = JSON.parse(JSON.stringify(instance.editor.getJSON())) as object
    instance.editor.commands.setContent(json)

    const raw = JSON.stringify(instance.editor.getJSON())
    expect(raw).toContain('"type":"citation"')
    expect(raw).toContain('"type":"bibliography"')
    expect(raw).toContain('"sourceId":"doe-2020"')
  })

  it('renders the bibliography from cited sources only', async () => {
    const { instance, target } = makeEditor({ citation: { sources: [bookDoe], style: 'apa' } })
    cleanup = () => { instance.destroy(); target.remove() }

    instance.editor.commands.focus()
    instance.pluginActions.insertCitation({ sourceId: 'doe-2020' })

    await vi.waitFor(() => {
      const bib = getCitationEngine(instance.editor)?.getBibliography() ?? []
      expect(bib.join(' ')).toContain('The Design of Tests')
    })
  })

  it('switches style live via setCitationStyle (no doc mutation)', async () => {
    const { instance, target } = makeEditor({ citation: { sources: [bookDoe], style: 'apa' } })
    cleanup = () => { instance.destroy(); target.remove() }

    instance.editor.commands.focus()
    instance.pluginActions.insertCitation({ sourceId: 'doe-2020' })
    const jsonBefore = JSON.stringify(instance.editor.getJSON())

    const engine = getCitationEngine(instance.editor)
    await vi.waitFor(() => expect(engine?.renderCluster(firstCitationId(instance))).toContain('(Doe'))

    const ok = citationPlugin.commands?.setCitationStyle?.(instance.editor, 'chicago-author-date')
    expect(ok).toBe(true)
    expect(engine?.getStyle()).toBe('chicago-author-date')
    // Style switch re-renders but never touches the document.
    expect(JSON.stringify(instance.editor.getJSON())).toBe(jsonBefore)
  })

  it('notifies the host when the cited-source set changes', async () => {
    const onSourcesChange = vi.fn()
    const { instance, target } = makeEditor({
      citation: { sources: [bookDoe], style: 'apa', onSourcesChange },
    })
    cleanup = () => { instance.destroy(); target.remove() }

    instance.editor.commands.focus()
    instance.pluginActions.insertCitation({ sourceId: 'doe-2020' })

    await vi.waitFor(() => {
      expect(onSourcesChange).toHaveBeenCalledWith(['doe-2020'])
    })
  })

  it('keeps free-text footnotes working (backward compatible)', () => {
    const { instance, target } = makeEditor()
    cleanup = () => { instance.destroy(); target.remove() }

    instance.editor.commands.focus()
    const result = instance.pluginActions.insertFootnote({ content: 'Manual note' })
    expect(result).toBe(true)

    const raw = JSON.stringify(instance.editor.getJSON())
    expect(raw).toContain('"content":"Manual note"')
    expect(raw).toContain('"sourceId":null')
  })

  it('repairs duplicate citationIds from copy-pasted citations', async () => {
    const { instance, target } = makeEditor({ citation: { sources: [bookDoe], style: 'apa' } })
    cleanup = () => { instance.destroy(); target.remove() }

    // Simulate a copy-paste: two citation nodes sharing one citationId.
    instance.editor.commands.focus()
    instance.editor.commands.insertContent({
      type: 'paragraph',
      content: [
        { type: 'citation', attrs: { citationId: 'dup-1', sourceId: 'doe-2020' } },
        { type: 'text', text: ' ' },
        { type: 'citation', attrs: { citationId: 'dup-1', sourceId: 'doe-2020' } },
      ],
    })

    await vi.waitFor(() => {
      const raw = JSON.stringify(instance.editor.getJSON())
      const ids = [...raw.matchAll(/"citationId":"([^"]+)"/g)].map((m) => m[1])
      expect(ids.length).toBe(2)
      expect(new Set(ids).size).toBe(2) // the later occurrence got a fresh id
    })

    // Both clusters render independently after the repair.
    const raw = JSON.stringify(instance.editor.getJSON())
    const ids = [...raw.matchAll(/"citationId":"([^"]+)"/g)].map((m) => m[1])
    const engine = getCitationEngine(instance.editor)
    for (const id of ids) {
      expect(engine?.renderCluster(id)).toContain('Doe')
    }
  })
})

/** Sets attrs on the first bibliography node and re-applies the document. */
function applyBibliographyAttrs(
  instance: ReturnType<typeof createEditor>,
  attrs: Record<string, unknown>,
): void {
  const json = JSON.parse(JSON.stringify(instance.editor.getJSON())) as JsonNode
  const walk = (nodes: JsonNode[] | undefined): boolean => {
    for (const node of nodes ?? []) {
      if (node.type === 'bibliography') {
        const target = node as { attrs?: Record<string, unknown> }
        target.attrs = { ...target.attrs, ...attrs }
        return true
      }
      if (walk(node.content)) return true
    }
    return false
  }
  walk(json.content)
  instance.editor.commands.setContent(json)
}

function bibliographyNodeAttrs(
  instance: ReturnType<typeof createEditor>,
): Record<string, unknown> {
  const walk = (nodes: JsonNode[] | undefined): Record<string, unknown> | null => {
    for (const node of nodes ?? []) {
      if (node.type === 'bibliography') return { ...(node.attrs as Record<string, unknown>) }
      const nested = walk(node.content)
      if (nested) return nested
    }
    return null
  }
  return walk((instance.editor.getJSON() as JsonNode).content) ?? {}
}

describe('bibliography node heading attrs (issue #239)', () => {
  let cleanup: (() => void) | null = null

  afterEach(() => {
    cleanup?.()
    cleanup = null
  })

  function insertCitedBibliography(extra: Record<string, unknown> = {}) {
    const made = makeEditor({
      citation: { sources: [bookDoe], style: 'chicago-notes-bibliography' },
      ...extra,
    })
    cleanup = () => { made.instance.destroy(); made.target.remove() }
    made.instance.editor.commands.focus()
    made.instance.pluginActions.insertCitation({ sourceId: 'doe-2020' })
    made.instance.editor.commands.focus('end')
    made.instance.pluginActions.insertBibliography()
    return made
  }

  it('renders the built-in heading by default (backward compatible)', async () => {
    const { instance } = insertCitedBibliography()
    const bib = instance.editor.view.dom.querySelector('.docs-bibliography')

    await vi.waitFor(() => {
      expect(bib?.querySelector('.docs-bibliography__heading')?.textContent).toBe('Bibliography')
    })
    expect(bib?.querySelectorAll('.docs-bibliography__entry').length).toBeGreaterThan(0)
  })

  it('suppresses the built-in heading when showHeading=false, keeping the entries', async () => {
    const { instance } = insertCitedBibliography()
    applyBibliographyAttrs(instance, { showHeading: false })

    const bib = instance.editor.view.dom.querySelector('.docs-bibliography')
    await vi.waitFor(() => {
      expect(bib?.querySelectorAll('.docs-bibliography__entry').length).toBeGreaterThan(0)
    })
    expect(bib?.querySelector('.docs-bibliography__heading')).toBeNull()
    expect(bib?.querySelector('.docs-bibliography__empty')).toBeNull()
  })

  it('relabels the heading when headingText is set', async () => {
    const { instance } = insertCitedBibliography()
    applyBibliographyAttrs(instance, { headingText: 'Daftar Pustaka' })

    const bib = instance.editor.view.dom.querySelector('.docs-bibliography')
    await vi.waitFor(() => {
      expect(bib?.querySelector('.docs-bibliography__heading')?.textContent).toBe('Daftar Pustaka')
    })
  })

  it('renders nothing when empty and showHeading=false', () => {
    const { instance, target } = makeEditor({
      citation: { sources: [bookDoe], style: 'chicago-notes-bibliography' },
    })
    cleanup = () => { instance.destroy(); target.remove() }

    // No citation → no bibliography entries.
    instance.editor.commands.setContent({
      type: 'doc',
      content: [{ type: 'bibliography', attrs: { showHeading: false } }],
    })

    const bib = instance.editor.view.dom.querySelector('.docs-bibliography')
    expect(bib?.childElementCount).toBe(0)
  })

  it('renders the placeholder label when empty and the heading is kept', () => {
    const { instance, target } = makeEditor({
      citation: { sources: [bookDoe], style: 'chicago-notes-bibliography' },
    })
    cleanup = () => { instance.destroy(); target.remove() }

    instance.editor.commands.setContent({
      type: 'doc',
      content: [{ type: 'bibliography', attrs: { headingText: 'Daftar Pustaka' } }],
    })

    const bib = instance.editor.view.dom.querySelector('.docs-bibliography')
    expect(bib?.querySelector('.docs-bibliography__empty')?.textContent).toBe('Daftar Pustaka')
  })

  it('round-trips both attrs through HTML (parseHTML ⇄ renderHTML)', () => {
    const { instance, target } = makeEditor({
      citation: { sources: [bookDoe], style: 'chicago-notes-bibliography' },
    })
    cleanup = () => { instance.destroy(); target.remove() }

    instance.editor.commands.setContent({
      type: 'doc',
      content: [{ type: 'bibliography', attrs: { showHeading: false, headingText: 'Daftar Pustaka' } }],
    })

    const html = instance.editor.getHTML()
    expect(html).toContain('data-show-heading="false"')
    expect(html).toContain('data-heading-text="Daftar Pustaka"')

    instance.editor.commands.setContent(html)
    const attrs = bibliographyNodeAttrs(instance)
    expect(attrs.showHeading).toBe(false)
    expect(attrs.headingText).toBe('Daftar Pustaka')
  })

  it('repaints the live node view when the attrs change in place', async () => {
    const { instance } = insertCitedBibliography()
    const bib = instance.editor.view.dom.querySelector('.docs-bibliography')
    await vi.waitFor(() => {
      expect(bib?.querySelector('.docs-bibliography__heading')).not.toBeNull()
    })

    // Change attrs on the existing node (no reload) — exercises the node
    // view's `update` path, which is what hosts use to hide the heading.
    let pos = -1
    instance.editor.state.doc.descendants((node, p) => {
      if (node.type.name === 'bibliography' && pos === -1) {
        pos = p
        return false
      }
      return true
    })
    expect(pos).toBeGreaterThanOrEqual(0)
    instance.editor.commands.setNodeSelection(pos)
    instance.editor.commands.updateAttributes('bibliography', { showHeading: false })

    await vi.waitFor(() => {
      expect(bib?.querySelector('.docs-bibliography__heading')).toBeNull()
    })
    expect(bib?.querySelectorAll('.docs-bibliography__entry').length).toBeGreaterThan(0)
    // The attr is persisted, so a reload keeps the hidden heading.
    expect(bibliographyNodeAttrs(instance).showHeading).toBe(false)
  })

  it('keeps the defaults out of the serialized HTML', () => {
    const { instance, target } = makeEditor({
      citation: { sources: [bookDoe], style: 'chicago-notes-bibliography' },
    })
    cleanup = () => { instance.destroy(); target.remove() }

    instance.pluginActions.insertBibliography()
    const html = instance.editor.getHTML()
    expect(html).toContain('data-node-type="bibliography"')
    expect(html).not.toContain('data-show-heading')
    expect(html).not.toContain('data-heading-text')
  })

  it('treats the Yjs string form "false" as hidden (collab round-trip)', async () => {
    const { instance } = insertCitedBibliography()
    // Yjs XML attributes are always strings: a collaborator seeds the block with
    // "false" instead of boolean false.
    applyBibliographyAttrs(instance, { showHeading: 'false' })

    const bib = instance.editor.view.dom.querySelector('.docs-bibliography')
    await vi.waitFor(() => {
      expect(bib?.querySelectorAll('.docs-bibliography__entry').length).toBeGreaterThan(0)
    })
    expect(bib?.querySelector('.docs-bibliography__heading')).toBeNull()
    // And it serializes back to the canonical HTML form.
    expect(instance.editor.getHTML()).toContain('data-show-heading="false"')
  })

  it('renders a bibliography that is part of the INITIAL document (engine binds after mount)', async () => {
    const { instance, target } = makeEditor({
      citation: { sources: [bookDoe], style: 'chicago-notes-bibliography' },
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'citation', attrs: { citationId: 'c1', sourceId: 'doe-2020' } }],
          },
          { type: 'bibliography', attrs: { showHeading: false } },
        ],
      },
    })
    cleanup = () => { instance.destroy(); target.remove() }

    // The engine is created by the plugin's onInit hook, i.e. AFTER the node
    // views for the initial document exist. They must bind to it lazily.
    const bib = instance.editor.view.dom.querySelector('.docs-bibliography')
    await vi.waitFor(() => {
      expect(bib?.querySelectorAll('.docs-bibliography__entry').length).toBeGreaterThan(0)
    })
    expect(bib?.textContent).toContain('The Design of Tests')
  })

  it('renders an inline citation that is part of the INITIAL document', async () => {
    const { instance, target } = makeEditor({
      citation: { sources: [bookDoe], style: 'apa' },
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'citation', attrs: { citationId: 'c1', sourceId: 'doe-2020' } }],
          },
        ],
      },
    })
    cleanup = () => { instance.destroy(); target.remove() }

    const citation = instance.editor.view.dom.querySelector('.docs-citation')
    await vi.waitFor(() => {
      expect(citation?.textContent).toContain('Doe')
    })
    expect(citation?.textContent).not.toContain('[?]')
  })
})
