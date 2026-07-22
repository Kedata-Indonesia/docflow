import { describe, it, expect } from 'vitest'
import { mapBlockNode, textToRun } from '../docx/nodes.js'
import { tableToDocxTable } from '../docx/table.js'
import { filenameFromTitle, wrapHtmlDocument } from '../utils.js'

describe('utils', () => {
  it('filenameFromTitle sanitizes special characters', () => {
    expect(filenameFromTitle('My Doc!@#$%^&*()', 'docx')).toBe('My Doc.docx')
    expect(filenameFromTitle('   ', 'txt')).toBe('Untitled Document.txt')
  })

  it('wrapHtmlDocument escapes title', () => {
    const html = wrapHtmlDocument('<script>alert(1)</script>', '<p>hi</p>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })
})

describe('docx nodes', () => {
  it('textToRun applies marks', () => {
    const runs = textToRun('hello', [
      { type: 'bold' },
      { type: 'italic' },
      { type: 'link', attrs: { href: 'https://example.com' } },
    ])
    expect(runs).toHaveLength(1)
    expect(runs[0].constructor.name).toBe('ExternalHyperlink')
  })

  it('mapBlockNode maps paragraph', () => {
    const paragraphs = mapBlockNode({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Hello' }],
    })
    expect(paragraphs).toHaveLength(1)
    expect(paragraphs[0].constructor.name).toBe('Paragraph')
  })

  it('mapBlockNode maps heading', () => {
    const paragraphs = mapBlockNode({
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Title' }],
    })
    expect(paragraphs).toHaveLength(1)
  })

  it('mapBlockNode maps pageBreak', () => {
    const paragraphs = mapBlockNode({ type: 'pageBreak' })
    expect(paragraphs).toHaveLength(1)
  })
})

describe('docx table', () => {
  it('tableToDocxTable converts PM table', () => {
    const table = tableToDocxTable({
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }] },
            { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }] },
          ],
        },
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '1' }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '2' }] }] },
          ],
        },
      ],
    })
    expect(table).not.toBeNull()
  })
})
