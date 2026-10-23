import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { exportDocx } from '../docx/index.js'
import { docxImageType } from '../docx/image.js'
import type { CitationExportPort } from '../types.js'

/** 1×1 transparent PNG — enough for the DOCX writer, tiny in the test file. */
const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const paragraph = (text: string) => ({
  type: 'paragraph',
  content: text ? [{ type: 'text', text }] : [],
})
const imageParagraph = (mime: string, base64: string) => ({
  type: 'paragraph',
  content: [{
    type: 'image',
    attrs: { src: `data:${mime};base64,${base64}`, width: 10, height: 10, alt: 'test' },
  }],
})

const citationPort: CitationExportPort = {
  renderCitation: (id) => (id === 'c1' ? '(Doe, 2020)' : ''),
  getReferenceList: () => [],
  getBibliography: () => [],
}

async function exportXml(doc: unknown, citation?: CitationExportPort): Promise<string> {
  const blob = await exportDocx({
    doc: doc as never,
    title: 'Blocks',
    ...(citation ? { citation } : {}),
  })
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  return zip.file('word/document.xml')!.async('string')
}

/** Paragraphs that carry no text, image, or footnote reference (i.e. blank lines). */
function blankParagraphCount(xml: string): number {
  // docx writes an empty paragraph as the self-closing `<w:p/>`.
  const paragraphs = xml.match(/<w:p(?:\s[^>]*)?(?:\/>|>[\s\S]*?<\/w:p>)/g) ?? []
  return paragraphs.filter(
    (p) => !p.includes('<w:t') && !p.includes('<w:drawing') && !p.includes('<w:footnoteReference'),
  ).length
}

describe('docx empty paragraphs (#371)', () => {
  it('keeps the blank line between two paragraphs', async () => {
    const without = await exportXml({
      type: 'doc',
      content: [paragraph('A'), paragraph('B')],
    })
    const withBlank = await exportXml({
      type: 'doc',
      content: [paragraph('A'), paragraph(''), paragraph('B')],
    })

    expect(withBlank).toContain('A')
    expect(withBlank).toContain('B')
    expect(blankParagraphCount(withBlank)).toBe(blankParagraphCount(without) + 1)
  })

  it('keeps an image-only paragraph inside a list item', async () => {
    const xml = await exportXml({
      type: 'doc',
      content: [{
        type: 'bulletList',
        content: [{
          type: 'listItem',
          content: [imageParagraph('image/png', TINY_PNG)],
        }],
      }],
    })

    expect(xml).toContain('•')
    expect(xml).toContain('<w:drawing')
  })
})

describe('docx table cells (#382)', () => {
  it('keeps marks, citations, multiple paragraphs and colspan', async () => {
    const xml = await exportXml({
      type: 'doc',
      content: [{
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [{
              type: 'tableHeader',
              attrs: { colspan: 2 },
              content: [paragraph('Merged header')],
            }],
          },
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                content: [{
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Bold cell', marks: [{ type: 'bold' }] }],
                }],
              },
              {
                type: 'tableCell',
                content: [
                  { type: 'paragraph', content: [{ type: 'citation', attrs: { citationId: 'c1' } }] },
                  {
                    type: 'bulletList',
                    content: [{ type: 'listItem', content: [paragraph('Nested item')] }],
                  },
                  paragraph('Second paragraph'),
                ],
              },
            ],
          },
        ],
      }],
    }, citationPort)

    expect(xml).toContain('<w:tbl')
    expect(xml).toContain('<w:gridSpan w:val="2"/>')
    expect(xml).toContain('<w:b/>')
    expect(xml).toContain('Bold cell')
    expect(xml).toContain('(Doe, 2020)')
    expect(xml).toContain('Nested item')
    expect(xml).toContain('Second paragraph')
  })
})

describe('docx images (#383)', () => {
  it('maps supported MIME types explicitly and never guesses JPEG', () => {
    expect(docxImageType('image/png')).toBe('png')
    expect(docxImageType('image/jpeg')).toBe('jpg')
    expect(docxImageType('image/jpg')).toBe('jpg')
    expect(docxImageType('image/gif')).toBe('gif')
    expect(docxImageType('image/bmp')).toBe('bmp')
    expect(docxImageType('image/webp')).toBeNull()
    expect(docxImageType('image/svg+xml')).toBeNull()
  })

  it('embeds PNG bytes', async () => {
    const xml = await exportXml({
      type: 'doc',
      content: [imageParagraph('image/png', TINY_PNG)],
    })
    expect(xml).toContain('<w:drawing')
  })

  it('degrades WebP to a placeholder instead of labelling it JPEG', async () => {
    // No DOM in this suite, so rasterisation is unavailable and the export must
    // fall back to text rather than embed mislabelled bytes.
    const xml = await exportXml({
      type: 'doc',
      content: [imageParagraph('image/webp', 'AAAA')],
    })
    expect(xml).toContain('Image failed to load')
    expect(xml).not.toContain('<w:drawing')
  })
})
