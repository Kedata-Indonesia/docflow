import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { exportDocx } from '../docx/index.js'

const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }] }

/** The section properties (`<w:sectPr>`) of the generated document. */
async function sectionXml(geometry?: unknown) {
  const blob = await exportDocx({ doc: doc as never, title: 'Geometry', geometry: geometry as never })
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const xml = await zip.file('word/document.xml')!.async('string')
  return xml.slice(xml.indexOf('<w:sectPr'), xml.indexOf('</w:sectPr>'))
}

/** A4 at 96 dpi with the editor's default 94 px (= 1 inch) margins. */
const a4 = {
  sizeId: 'a4',
  pageWidth: 794,
  pageHeight: 1123,
  margins: { top: 94, bottom: 94, left: 94, right: 94 },
}

describe('docx page geometry', () => {
  it('keeps the historical output when no geometry is supplied', async () => {
    const xml = await sectionXml()
    // 1 inch = 1440 twips, and docx's own default page size.
    expect(xml).toContain('w:top="1440"')
    expect(xml).toContain('w:right="1440"')
    expect(xml).toContain('w:bottom="1440"')
    expect(xml).toContain('w:left="1440"')
    expect(xml).toContain('w:w="11906"')
    expect(xml).toContain('w:h="16838"')
  })

  it('honours the host geometry (page size + margins) instead of hard-coding A4/1 inch', async () => {
    const xml = await sectionXml(a4)
    // 794 px * 15 = 11910 twips, 1123 px * 15 = 16845 twips, 94 px * 15 = 1410 twips.
    expect(xml).toContain('w:w="11910"')
    expect(xml).toContain('w:h="16845"')
    expect(xml).toContain('w:top="1410"')
    expect(xml).toContain('w:right="1410"')
    expect(xml).toContain('w:bottom="1410"')
    expect(xml).toContain('w:left="1410"')
    expect(xml).toContain('w:orient="portrait"')
  })

  it('maps landscape orientation with the page dimensions swapped', async () => {
    const xml = await sectionXml({
      ...a4,
      pageWidth: 1123,
      pageHeight: 794,
      orientation: 'landscape',
    })
    expect(xml).toContain('w:orient="landscape"')
    expect(xml).toContain('w:w="16845"')
    expect(xml).toContain('w:h="11910"')
  })

  it('supports a non-default page size and margins', async () => {
    const xml = await sectionXml({
      sizeId: 'letter',
      pageWidth: 816,
      pageHeight: 1056,
      margins: { top: 76, bottom: 76, left: 76, right: 76 },
    })
    expect(xml).toContain('w:w="12240"')
    expect(xml).toContain('w:h="15840"')
    expect(xml).toContain('w:top="1140"')
  })
})
