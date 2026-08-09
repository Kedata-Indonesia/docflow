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
