import { describe, it, expect } from 'vitest'
import type { CslItemData } from '@kedata-indonesia/docflow-core'
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

describe('sanitizeCiteprocHtml', () => {
  it('keeps citeproc formatting tags and escapes everything else', () => {
    expect(sanitizeCiteprocHtml('<i>ok</i>')).toBe('<i>ok</i>')
    expect(sanitizeCiteprocHtml('<span style="font-variant:small-caps;">ok</span>')).toContain('small-caps')
    expect(sanitizeCiteprocHtml('<script>x</script>')).toBe('&lt;script&gt;x&lt;/script&gt;')
    expect(sanitizeCiteprocHtml('<img src=x onerror=y>')).not.toContain('<img')
  })
})
