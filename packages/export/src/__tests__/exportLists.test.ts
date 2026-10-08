import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { exportDocx } from '../docx/index.js'

/** Concatenated text runs of a generated part, for easy assertions. */
const textOf = (xml: string) => [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('|')

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const item = (text: string) => ({ type: 'listItem', content: [paragraph(text)] })

async function exportText(doc: unknown) {
  const blob = await exportDocx({ doc: doc as never, title: 'Lists' })
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const xml = await zip.file('word/document.xml')!.async('string')
  const notesXml = (await zip.file('word/footnotes.xml')?.async('string')) ?? ''
  return { xml, body: textOf(xml), notes: textOf(notesXml) }
}

describe('docx list export', () => {
  it('keeps bullet list item text', async () => {
    const { body } = await exportText({
      type: 'doc',
      content: [{ type: 'bulletList', content: [item('Deliverable 1'), item('Deliverable 2')] }],
    })
    expect(body).toContain('•')
    expect(body).toContain('Deliverable 1')
    expect(body).toContain('Deliverable 2')
  })

  it('numbers ordered list items and keeps their text', async () => {
    const { body } = await exportText({
      type: 'doc',
      content: [{ type: 'orderedList', content: [item('First'), item('Second')] }],
    })
    expect(body).toContain('1.')
    expect(body).toContain('2.')
    expect(body).toContain('First')
    expect(body).toContain('Second')
  })

  it('exports nested list items', async () => {
    const { body } = await exportText({
      type: 'doc',
      content: [{
        type: 'bulletList',
        content: [
          item('Parent'),
          { type: 'listItem', content: [paragraph('Parent 2'), { type: 'bulletList', content: [item('Child A')] }] },
        ],
      }],
    })
    expect(body).toContain('Parent 2')
    expect(body).toContain('Child A')
  })

  it('keeps inline marks inside a list item', async () => {
    const { xml, body } = await exportText({
      type: 'doc',
      content: [{
        type: 'bulletList',
        content: [{
          type: 'listItem',
          content: [{
            type: 'paragraph',
            content: [
              { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
              { type: 'text', text: ' link', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] },
            ],
          }],
        }],
      }],
    })
    expect(body).toContain('bold')
    expect(body).toContain('link')
    expect(xml).toContain('<w:b/>')
  })

  it('collects a footnote inside a list item as a real footnote', async () => {
    const { xml, body, notes } = await exportText({
      type: 'doc',
      content: [{
        type: 'bulletList',
        content: [{
          type: 'listItem',
          content: [{
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Deliverable 1' },
              { type: 'footnote', attrs: { content: 'note text' } },
            ],
          }],
        }],
      }],
    })
    expect(body).toContain('Deliverable 1')
    expect(xml).toContain('footnoteReference')
    expect(notes).toContain('note text')
  })
})
