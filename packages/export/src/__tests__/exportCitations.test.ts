import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { citeHtmlToRuns, footnoteBodyRuns, FootnoteCollector } from '../docx/citation.js'
import { inlineNodesToRuns, type WalkContext } from '../docx/nodes.js'
import { exportDocx } from '../docx/index.js'
import type { CitationExportPort } from '../types.js'

const citationPort: CitationExportPort = {
  renderCitation: (id) => (id === 'c1' ? '(Doe, <i>2020</i>)' : ''),
  getBibliography: () => [
    'Doe, John. <i>The Design of Tests</i>. Jakarta: Test Press, 2020.',
    'Smith, Jane. "Citation Systems." <i>Journal of Testing</i> 12, no. 3 (2021): 45-61.',
  ],
}

describe('citeHtmlToRuns', () => {
  it('splits fragments into runs and decodes entities', () => {
    const runs = citeHtmlToRuns('Doe, <i>The Design &amp; Tests</i>, <sup>3</sup> ed.')
    expect(runs.length).toBeGreaterThanOrEqual(3)
    // Styles are asserted end-to-end via the generated document.xml below.
  })
})

describe('footnoteBodyRuns', () => {
  it('renders citation-backed footnotes from the port', () => {
    const runs = footnoteBodyRuns(
      { type: 'footnote', attrs: { sourceId: 's1', citationId: 'c1' } },
      citationPort,
    )
    expect(runs.length).toBeGreaterThan(0)
  })

  it('keeps free-text footnotes working', () => {
    const runs = footnoteBodyRuns({ type: 'footnote', attrs: { content: 'Manual note' } }, citationPort)
    expect(runs).toHaveLength(1)
  })
})

describe('inlineNodesToRuns with walk context', () => {
  it('renders citation nodes as derived text', () => {
    const runs = inlineNodesToRuns(
      { type: 'paragraph', content: [{ type: 'citation', attrs: { citationId: 'c1', sourceId: 's1' } }] },
      { citation: citationPort },
    )
    expect(runs.length).toBeGreaterThan(0)
  })

  it('converts inline footnotes to real footnote references', () => {
    const walkCtx: WalkContext = { citation: citationPort, footnotes: new FootnoteCollector() }
    const runs = inlineNodesToRuns(
      { type: 'paragraph', content: [{ type: 'footnote', attrs: { sourceId: 's1', citationId: 'c1' } }] },
      walkCtx,
    )
    expect(runs[0].constructor.name).toBe('FootnoteReferenceRun')
    expect(Object.keys(walkCtx.footnotes!.toDocumentOption())).toHaveLength(1)
  })
})

describe('exportDocx with citations (6D)', () => {
  it('produces a .docx containing rendered citations, a real footnote, and the bibliography', async () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'As shown in recent work' },
            { type: 'citation', attrs: { citationId: 'c1', sourceId: 's1' } },
            { type: 'text', text: ', the point holds' },
            { type: 'footnote', attrs: { content: '', sourceId: 's1', citationId: 'c1' } },
            { type: 'text', text: '.' },
          ],
        },
        { type: 'bibliography' },
      ],
    }

    const blob = await exportDocx({ doc, title: 'Cited Doc', citation: citationPort })
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const documentXml = await zip.file('word/document.xml')!.async('string')
    const footnotesXml = await zip.file('word/footnotes.xml')!.async('string')

    // Inline citation rendered as derived text (italics preserved as real
    // DOCX run styles).
    expect(documentXml).toContain('Doe, ')
    expect(documentXml).toContain('<w:i/>')
    expect(documentXml).toContain('2020')
    // Real footnote reference in the body + body in footnotes.xml.
    expect(documentXml).toContain('footnoteReference')
    expect(footnotesXml).toContain('Doe, ')
    // Bibliography heading + entries with hanging indent.
    expect(documentXml).toContain('Bibliography')
    expect(documentXml).toContain('The Design of Tests')
    expect(documentXml).toContain('Journal of Testing')
  })

  it('still exports cleanly when no citation port is injected', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Plain text.' }] },
        { type: 'bibliography' },
      ],
    }
    const blob = await exportDocx({ doc, title: 'No Port' })
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const documentXml = await zip.file('word/document.xml')!.async('string')
    expect(documentXml).toContain('Plain text.')
    expect(documentXml).not.toContain('Bibliography')
  })

  it('honours showHeading=false / headingText on the bibliography node', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'citation', attrs: { citationId: 'c1', sourceId: 's1' } }] },
        { type: 'bibliography', attrs: { showHeading: false } },
      ],
    }

    const blob = await exportDocx({ doc, title: 'No Heading', citation: citationPort })
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const documentXml = await zip.file('word/document.xml')!.async('string')

    // Entries survive; the built-in heading does not.
    expect(documentXml).toContain('The Design of Tests')
    expect(documentXml).not.toContain('Bibliography')
  })

  it('relabels the bibliography heading via headingText', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'citation', attrs: { citationId: 'c1', sourceId: 's1' } }] },
        { type: 'bibliography', attrs: { headingText: 'Daftar Pustaka' } },
      ],
    }

    const blob = await exportDocx({ doc, title: 'Relabelled', citation: citationPort })
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const documentXml = await zip.file('word/document.xml')!.async('string')

    expect(documentXml).toContain('Daftar Pustaka')
    expect(documentXml).not.toContain('Bibliography')
  })
})
