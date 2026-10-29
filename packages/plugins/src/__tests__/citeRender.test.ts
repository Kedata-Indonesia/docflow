import { describe, expect, it } from 'vitest'
import type { CslItemData } from '@kedata-indonesia/docflow-core'
import { buildClusterSignature, renderCitations } from '../cite/citeRender.js'
import { CSL_STYLES, DEFAULT_CSL_STYLE } from '../csl/index.js'

/**
 * The renderer is a pure function: clusters + sources in, derived text out.
 * These tests pin the two contracts `CiteEngine` relies on — the memoization
 * signature and the cited-only/all-sources bibliography split (#252).
 */

const bookDoe: CslItemData = {
  id: 'doe-2020',
  type: 'book',
  title: 'The Design of Tests',
  author: [{ family: 'Doe', given: 'John' }],
  issued: { 'date-parts': [[2020]] },
  publisher: 'Test Press',
  'publisher-place': 'Jakarta',
}

const styleInfo = CSL_STYLES[DEFAULT_CSL_STYLE]

describe('buildClusterSignature', () => {
  it('is stable across equivalent clusters', () => {
    const first = buildClusterSignature([
      { citationId: 'c1', attrs: { sourceId: 'doe-2020', locator: '12' } },
    ])
    const second = buildClusterSignature([
      { citationId: 'c1', attrs: { sourceId: 'doe-2020', locator: '12' } },
    ])
    expect(second).toBe(first)
  })

  it('changes when order or any rendered attribute changes', () => {
    const base = [
      { citationId: 'c1', attrs: { sourceId: 'doe-2020' } },
      { citationId: 'c2', attrs: { sourceId: 'doe-2020' } },
    ]
    const signature = buildClusterSignature(base)

    expect(buildClusterSignature([base[1], base[0]])).not.toBe(signature)
    expect(
      buildClusterSignature([
        { citationId: 'c1', attrs: { sourceId: 'doe-2020', locator: '9' } },
        base[1],
      ]),
    ).not.toBe(signature)
  })
})

describe('renderCitations', () => {
  // One engine build per file: citeproc parses the CSL on construction, which
  // dominates the runtime of the whole plugins suite.
  it('splits the reference list from the bibliography and blanks unknown ids', () => {
    const result = renderCitations({
      styleInfo,
      sources: new Map([
        ['doe-2020', bookDoe],
        ['smith-2021', { ...bookDoe, id: 'smith-2021', title: 'Uncited', author: [] }],
      ]),
      clusters: new Map([
        ['c1', { sourceId: 'doe-2020' }],
        ['c2', { sourceId: 'gone' }],
      ]),
      order: ['c1', 'c2'],
    })

    expect(result.rendered.get('c1')).toContain('Doe')
    expect(result.rendered.get('c2')).toBe('')
    // Cited-only vs. every saved source (#252).
    expect(result.referenceList).toHaveLength(1)
    expect(result.bibliography).toHaveLength(2)
  })
})
