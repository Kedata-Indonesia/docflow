import { ImageRun, Paragraph, TextRun } from 'docx'
import type { ExportContext } from '../types.js'
import type { PmNode } from './nodes.js'

interface DecodedImage {
  data: Uint8Array
  mime: string
}

/**
 * Decode a `data:` URL so chart previews (and pasted images) export without a
 * host `resolveImage` port — the bytes are already in the document.
 */
export function decodeDataUrl(src: string): DecodedImage | null {
  const match = /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(src)
  if (!match) return null
  const [, mime, base64, payload] = match
  try {
    if (base64) {
      const binary = atob(payload)
      const data = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) data[i] = binary.charCodeAt(i)
      return { data, mime }
    }
    const text = decodeURIComponent(payload)
    const data = new Uint8Array(text.length)
    for (let i = 0; i < text.length; i++) data[i] = text.charCodeAt(i)
    return { data, mime }
  } catch {
    return null
  }
}

export async function imageToDocxParagraph(
  node: PmNode,
  ctx: ExportContext,
): Promise<Paragraph | null> {
  const src = node.attrs?.src as string | undefined
  const alt = node.attrs?.alt as string | undefined
  if (!src) return null

  const width = (node.attrs?.width as number | undefined) ?? 600
  const height = (node.attrs?.height as number | undefined) ?? 400

  try {
    const inline = decodeDataUrl(src)
    const resolver = ctx.resolveImage
    let resolved: DecodedImage & { width?: number; height?: number }
    if (inline) {
      resolved = inline
    } else if (resolver) {
      resolved = await resolver(src)
    } else {
      return new Paragraph({ children: [new TextRun({ text: `[Image: ${alt || src}]` })] })
    }

    return new Paragraph({
      children: [new ImageRun({
        data: resolved.data,
        type: resolved.mime === 'image/png' ? 'png' : resolved.mime === 'image/gif' ? 'gif' : 'jpg',
        transformation: { width, height },
      })],
    })
  } catch {
    return new Paragraph({ children: [new TextRun({ text: `[Image failed to load: ${alt || src}]` })] })
  }
}
