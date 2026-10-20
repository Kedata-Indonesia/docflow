import { describe, it, expect } from 'vitest'
import type { CslItemData, CslStyleInfo } from '@kedata-indonesia/docflow-core'
import { CiteEngine, sanitizeCiteprocHtml } from '../citeEngine.js'

const bookDoe: CslItemData = {
  id: 'doe-2020',
  type: 'book',
  title: 'The Design of Tests',
  author: [{ family: 'Doe', given: 'John' }],
  issued: { 'date-parts': [[2020]] },
  publisher: 'Test Press',
  'publisher-place': 'Jakarta',
}

const articleSmith: CslItemData = {
  id: 'smith-2021',
  type: 'article-journal',
  title: 'Citation Systems',
  author: [{ family: 'Smith', given: 'Jane' }],
  issued: { 'date-parts': [[2021]] },
  'container-title': 'Journal of Testing',
  volume: '12',
  issue: '3',
  page: '45-61',
}

describe('CiteEngine (T1)', () => {
  it('renders a Chicago notes-bibliography cluster and bibliography', () => {
    const engine = new CiteEngine({ sources: [bookDoe, articleSmith], style: 'chicago-notes-bibliography' })
    engine.syncCitations([
      { citationId: 'c1', attrs: { sourceId: 'doe-2020', locator: '12' } },
      { citationId: 'c2', attrs: { sourceId: 'smith-2021' } },
    ])

    const first = engine.renderCluster('c1')
    const second = engine.renderCluster('c2')

    expect(first).toContain('Doe')
    expect(first).toContain('<i>The Design of Tests</i>')
    expect(first).toContain('12')
    expect(second).toContain('Smith')
    expect(second).toContain('Citation Systems')

    const bib = engine.getBibliography()
    expect(bib).toHaveLength(2)
    expect(bib.join(' ')).toContain('The Design of Tests')
    expect(bib.join(' ')).toContain('Journal of Testing')
  })

  it('reformats everything on live style switch (Chicago → APA)', () => {
    const engine = new CiteEngine({ sources: [bookDoe], style: 'chicago-notes-bibliography' })
    engine.syncCitations([{ citationId: 'c1', attrs: { sourceId: 'doe-2020' } }])
    const chicagoText = engine.renderCluster('c1')

    const changes: number[] = []
    engine.onChange(() => changes.push(1))
    engine.setStyle('apa')

    const apaText = engine.renderCluster('c1')
    expect(apaText).not.toBe(chicagoText)
    expect(apaText).toContain('Doe')
    expect(apaText).toContain('2020')
    // APA in-text citations are parenthesized author-date
    expect(apaText).toMatch(/\(.*Doe.*2020.*\)/)
    expect(changes.length).toBeGreaterThan(0)
  })

  it('uses a shortened/ibid form for immediately repeated citations in note styles', () => {
    const engine = new CiteEngine({ sources: [bookDoe], style: 'chicago-notes-bibliography' })
    engine.syncCitations([
      { citationId: 'c1', attrs: { sourceId: 'doe-2020', locator: '12' } },
      { citationId: 'c2', attrs: { sourceId: 'doe-2020', locator: '14' } },
    ])

    const first = engine.renderCluster('c1')
    const second = engine.renderCluster('c2')

    expect(first).toContain('Doe')
    expect(second).not.toBe(first)
    // Chicago 17: either classic "Ibid." or the shortened note form — never
    // the full note repeated.
    const isShortened = second.includes('Ibid') || second.length < first.length
    expect(isShortened).toBe(true)
    expect(second).toContain('14')
  })

  it('returns an empty string for citations whose source is missing', () => {
    const engine = new CiteEngine({ sources: [bookDoe], style: 'apa' })
    engine.syncCitations([{ citationId: 'c1', attrs: { sourceId: 'ghost' } }])
    expect(engine.renderCluster('c1')).toBe('')
    expect(engine.getBibliography()).toHaveLength(0)
  })

  it('re-renders when sources are updated', () => {
    const engine = new CiteEngine({ sources: [bookDoe], style: 'apa' })
    engine.syncCitations([{ citationId: 'c1', attrs: { sourceId: 'doe-2020' } }])
    const before = engine.renderCluster('c1')

    // APA in-text cites author + year — changing the author must re-render.
    engine.updateSources([{ ...bookDoe, author: [{ family: 'Roe', given: 'Jane' }] }])
    const after = engine.renderCluster('c1')
    expect(after).not.toBe(before)
    expect(after).toContain('Roe')
  })

  it('escapes raw markup in source metadata (XSS-safe)', () => {
    const evil: CslItemData = { ...bookDoe, id: 'evil', title: '<script>alert(1)</script>' }
    const engine = new CiteEngine({ sources: [evil], style: 'apa' })
    engine.syncCitations([{ citationId: 'c1', attrs: { sourceId: 'evil' } }])
    expect(engine.renderCluster('c1')).not.toContain('<script>')
  })
})

describe('host-injected CSL styles (#180)', () => {
  /** A minimal valid in-text CSL style, distinctive enough to assert on. */
  const harvardLite: CslStyleInfo = {
    id: 'harvard-lite',
    name: 'Harvard (test)',
    category: 'in-text',
    xml: [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0" default-locale="en-US">',
      '  <info><title>Harvard (test)</title><id>harvard-lite</id><updated>2026-01-01T00:00:00+00:00</updated></info>',
      '  <citation><layout prefix="HVD(" suffix=")" delimiter="; "><text variable="title" font-style="italic"/></layout></citation>',
      '  <bibliography><layout suffix="."><text variable="title"/></layout></bibliography>',
      '</style>',
    ].join('\n'),
  }

  it('renders with a host style that the library does not bundle', () => {
    const engine = new CiteEngine({ sources: [bookDoe], style: 'harvard-lite', styles: [harvardLite] })
    engine.syncCitations([{ citationId: 'c1', attrs: { sourceId: 'doe-2020' } }])

    expect(engine.getStyle()).toBe('harvard-lite')
    expect(engine.renderCluster('c1')).toBe('HVD(<i>The Design of Tests</i>)')
  })

  it('keeps the four bundled styles available alongside the injected one', () => {
    const engine = new CiteEngine({ styles: [harvardLite] })
    const ids = engine.getAvailableStyles().map((s) => s.id)

    expect(ids).toEqual([
      'apa',
      'chicago-author-date',
      'chicago-notes-bibliography',
      'harvard-lite',
      'modern-language-association',
    ])
    // Default behaviour with no styles passed is untouched.
    expect(new CiteEngine().getAvailableStyles()).toHaveLength(4)
  })

  it('lets a host override a bundled style by id', () => {
    const engine = new CiteEngine({
      sources: [bookDoe],
      style: 'apa',
      styles: [{ ...harvardLite, id: 'apa', category: 'in-text' }],
    })
    engine.syncCitations([{ citationId: 'c1', attrs: { sourceId: 'doe-2020' } }])

    expect(engine.renderCluster('c1')).toContain('HVD(')
    expect(engine.getAvailableStyles()).toHaveLength(4)
  })

  it('falls back to the default style for an unknown id instead of throwing', () => {
    const engine = new CiteEngine({ sources: [bookDoe], style: 'not-a-style', styles: [harvardLite] })

    expect(engine.getStyle()).toBe('chicago-notes-bibliography')

    // A live switch to something unknown is a no-op, not a blank document.
    engine.syncCitations([{ citationId: 'c1', attrs: { sourceId: 'doe-2020' } }])
    const before = engine.renderCluster('c1')
    engine.setStyle('still-not-a-style')
    expect(engine.getStyle()).toBe('chicago-notes-bibliography')
    expect(engine.renderCluster('c1')).toBe(before)
  })

  it('marks a host note style as a note style (footnote path)', () => {
    const noteStyle: CslStyleInfo = { ...harvardLite, id: 'note-lite', category: 'note' }
    const engine = new CiteEngine({ style: 'note-lite', styles: [noteStyle] })

    expect(engine.isNoteStyle()).toBe(true)
    expect(new CiteEngine({ styles: [harvardLite] }).isNoteStyle()).toBe(true) // chicago notes default
  })

  it('rejects a malformed style up front, naming the offending entry', () => {
    expect(() => new CiteEngine({ styles: [{ ...harvardLite, id: '' }] })).toThrow(/non-empty id/)
    expect(() => new CiteEngine({ styles: [{ ...harvardLite, xml: '  ' }] })).toThrow(/harvard-lite/)
  })

  it('does not leak styles between engines (no process-wide registry)', () => {
    const withCustom = new CiteEngine({ styles: [harvardLite] })
    const plain = new CiteEngine()

    expect(withCustom.getAvailableStyles().map((s) => s.id)).toContain('harvard-lite')
    expect(plain.getAvailableStyles().map((s) => s.id)).not.toContain('harvard-lite')
  })
})

describe('runtime style registration (#251)', () => {
  /** A minimal valid in-text CSL style, distinctive enough to assert on. */
  const importedLite: CslStyleInfo = {
    id: 'imported-lite',
    name: 'Imported (test)',
    category: 'in-text',
    xml: [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0" default-locale="en-US">',
      '  <info><title>Imported (test)</title><id>imported-lite</id><updated>2026-01-01T00:00:00+00:00</updated></info>',
      '  <citation><layout prefix="IMP(" suffix=")" delimiter="; "><text variable="title" font-style="italic"/></layout></citation>',
      '  <bibliography><layout suffix="."><text variable="title"/></layout></bibliography>',
      '</style>',
    ].join('\n'),
  }

  it('registers a style at runtime and renders with it', () => {
    const engine = new CiteEngine({ sources: [bookDoe] })
    engine.syncCitations([{ citationId: 'c1', attrs: { sourceId: 'doe-2020' } }])

    engine.registerStyle(importedLite)
    expect(engine.getAvailableStyles().map((s) => s.id)).toContain('imported-lite')

    engine.setStyle('imported-lite')
    expect(engine.getStyle()).toBe('imported-lite')
    expect(engine.renderCluster('c1')).toBe('IMP(<i>The Design of Tests</i>)')
  })

  it('marks an imported note style as a note style (footnote path)', () => {
    const engine = new CiteEngine()
    engine.registerStyle({ ...importedLite, id: 'imported-note', category: 'note' })
    engine.setStyle('imported-note')

    expect(engine.isNoteStyle()).toBe(true)
  })

  it('replaces a bundled style by id, the same rule as CitationPort.styles', () => {
    const engine = new CiteEngine({ sources: [bookDoe] })
    engine.registerStyle({ ...importedLite, id: 'apa', name: 'Imported APA' })

    // Still four styles: the imported one took apa's slot.
    expect(engine.getAvailableStyles()).toHaveLength(4)
    expect(engine.getAvailableStyles().find((s) => s.id === 'apa')?.name).toBe('Imported APA')

    engine.setStyle('apa')
    engine.syncCitations([{ citationId: 'c1', attrs: { sourceId: 'doe-2020' } }])
    expect(engine.renderCluster('c1')).toContain('IMP(')
  })

  it('rejects malformed XML without touching the registry, the active style, or the output', () => {
    const engine = new CiteEngine({ sources: [bookDoe], style: 'apa' })
    engine.syncCitations([{ citationId: 'c1', attrs: { sourceId: 'doe-2020' } }])
    const before = engine.renderCluster('c1')
    const stylesBefore = engine.getAvailableStyles().map((s) => s.id)

    expect(() =>
      engine.registerStyle({ ...importedLite, id: 'broken', xml: '<style id="broken">' }),
    ).toThrow(/citeproc could not parse/)

    expect(engine.getAvailableStyles().map((s) => s.id)).toEqual(stylesBefore)
    expect(engine.getStyle()).toBe('apa')
    expect(engine.renderCluster('c1')).toBe(before)
  })

  it('rejects an entry without an id or XML', () => {
    const engine = new CiteEngine()

    expect(() => engine.registerStyle({ ...importedLite, id: '  ' })).toThrow(/non-empty id/)
    expect(() => engine.registerStyle({ ...importedLite, xml: '  ' })).toThrow(/imported-lite/)
  })

  it('re-renders when the active style is replaced in place', () => {
    const engine = new CiteEngine({ sources: [bookDoe], style: 'apa' })
    engine.syncCitations([{ citationId: 'c1', attrs: { sourceId: 'doe-2020' } }])
    const before = engine.renderCluster('c1')

    const changes: number[] = []
    engine.onChange(() => changes.push(1))
    engine.registerStyle({ ...importedLite, id: 'apa' })

    expect(changes.length).toBeGreaterThan(0)
    expect(engine.renderCluster('c1')).not.toBe(before)
    expect(engine.renderCluster('c1')).toContain('IMP(')
  })
})

describe('sanitizeCiteprocHtml', () => {
  it('keeps citeproc formatting tags and escapes everything else', () => {
    expect(sanitizeCiteprocHtml('<i>ok</i>')).toBe('<i>ok</i>')
    expect(sanitizeCiteprocHtml('<span style="font-variant:small-caps;">ok</span>')).toContain('small-caps')
    expect(sanitizeCiteprocHtml('<script>x</script>')).toBe('&lt;script&gt;x&lt;/script&gt;')
    expect(sanitizeCiteprocHtml('<img src=x onerror=y>')).not.toContain('<img')
  })
})
