import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { exportDocx } from '../docx/index.js'
import { decodeDataUrl } from '../docx/image.js'

// 1×1 transparent PNG — enough for the DOCX writer, tiny in the test file.
const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

describe('decodeDataUrl', () => {
  it('decodes base64 payloads', () => {
    const decoded = decodeDataUrl(`data:image/png;base64,${TINY_PNG}`)
    expect(decoded?.mime).toBe('image/png')
    expect(decoded?.data[0]).toBe(0x89)
    expect(decoded?.data[1]).toBe(0x50)
  })

  it('decodes percent-encoded payloads', () => {
    const decoded = decodeDataUrl('data:image/svg+xml,%3Csvg%2F%3E')
    expect(decoded?.mime).toBe('image/svg+xml')
    expect(new TextDecoder().decode(decoded?.data)).toBe('<svg/>')
  })

  it('accepts media-type parameters before the payload', () => {
    const decoded = decodeDataUrl('data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E')
    expect(decoded?.mime).toBe('image/svg+xml')
    expect(new TextDecoder().decode(decoded?.data)).toBe('<svg/>')
  })

  it('accepts parameters combined with base64', () => {
    const decoded = decodeDataUrl(`data:image/png;charset=utf-8;base64,${TINY_PNG}`)
    expect(decoded?.mime).toBe('image/png')
    expect(decoded?.data[0]).toBe(0x89)
  })

  it('returns null for non-data URLs', () => {
    expect(decodeDataUrl('https://example.com/a.png')).toBeNull()
  })
})

describe('docx chart export', () => {
  it('embeds the cached chart preview as an image', async () => {
    const blob = await exportDocx({
      doc: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Quarterly revenue' }],
          },
          {
            type: 'chart',
            attrs: {
              chartType: 'column',
              preview: `data:image/png;base64,${TINY_PNG}`,
              width: 600,
              height: 340,
            },
          },
        ],
      } as never,
      title: 'Chart',
    })

    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const media = Object.keys(zip.files).filter((name) => name.startsWith('word/media/') && !zip.files[name].dir)
    expect(media.length).toBe(1)

    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toContain('<w:drawing>')
    expect(xml).toContain('Quarterly revenue')
  })

  it('skips charts without a preview instead of throwing', async () => {
    const blob = await exportDocx({
      doc: {
        type: 'doc',
        content: [{ type: 'chart', attrs: { chartType: 'pie' } }],
      } as never,
      title: 'Chart',
    })
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const media = Object.keys(zip.files).filter((name) => name.startsWith('word/media/') && !zip.files[name].dir)
    expect(media).toHaveLength(0)
  })
})
