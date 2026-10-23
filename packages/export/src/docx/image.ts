import { ImageRun, Paragraph, TextRun } from 'docx'
import type { ExportContext } from '../types.js'
import type { PmNode, WalkContext } from './nodes.js'

interface DecodedImage {
  data: Uint8Array
  mime: string
}

/** A payload `docx` can embed without guessing. */
export interface DocxImage {
  data: Uint8Array
  type: 'png' | 'jpg' | 'gif' | 'bmp'
}

/**
 * Decode a `data:` URL so chart previews (and pasted images) export without a
 * host `resolveImage` port — the bytes are already in the document.
 */
export function decodeDataUrl(src: string): DecodedImage | null {
  // The metadata may carry media-type parameters (`;charset=utf-8`) as well as
  // `;base64`; accepting only a bare mime made SVG data URLs resolve to null.
  const match = /^data:([^,]*),([\s\S]*)$/.exec(src)
  if (!match) return null
  const [, meta, payload] = match
  const parts = meta.split(';').map((part) => part.trim())
  const mime = parts.shift() ?? ''
  if (!mime) return null
  const base64 = parts.some((part) => part.toLowerCase() === 'base64')
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

/** Map a MIME type to a format `docx` can embed. `null` means "needs conversion". */
export function docxImageType(mime: string): DocxImage['type'] | null {
  switch (mime.toLowerCase()) {
    case 'image/png':
      return 'png'
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg'
    case 'image/gif':
      return 'gif'
    case 'image/bmp':
      return 'bmp'
    default:
      // WebP and SVG have no direct DOCX representation: rasterise to PNG.
      return null
  }
}

/**
 * Rasterise WebP/SVG to PNG in the browser. Server-side callers (no DOM) get
 * `null`, and the image degrades to the existing placeholder text rather than
 * being mislabelled as a JPEG (issue #383).
 */
async function rasterizeToPng(data: Uint8Array, mime: string): Promise<DocxImage | null> {
  if (typeof document === 'undefined' || typeof Blob === 'undefined') return null
  let objectUrl: string | null = null
  try {
    // TS types `Uint8Array` over `ArrayBufferLike`; Blob accepts the same bytes.
    const blob = new Blob([data as unknown as BlobPart], { type: mime })
    let source: CanvasImageSource | null = null
    if (typeof createImageBitmap === 'function') {
      try {
        source = await createImageBitmap(blob)
      } catch {
        // Chrome rejects SVG blobs here; fall through to the <img> decoder.
        source = null
      }
    }
    if (!source) {
      objectUrl = URL.createObjectURL(blob)
      const img = new Image()
      img.src = objectUrl
      await img.decode()
      source = img
    }
    const width = Number(
      (source as HTMLImageElement).naturalWidth || (source as ImageBitmap).width || 0,
    )
    const height = Number(
      (source as HTMLImageElement).naturalHeight || (source as ImageBitmap).height || 0,
    )
    if (!width || !height) return null

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(source, 0, 0)
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!png) return null
    return { data: new Uint8Array(await png.arrayBuffer()), type: 'png' }
  } catch {
    return null
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}

/** Resolve bytes to a format DOCX can embed, converting WebP/SVG when possible. */
export async function normalizeImage(data: Uint8Array, mime: string): Promise<DocxImage | null> {
  const type = docxImageType(mime)
  if (type) return { data, type }
  return rasterizeToPng(data, mime)
}

/** Resolve an image `src` (data URL or host port) into embeddable bytes. */
export async function resolveDocxImage(src: string, ctx: ExportContext): Promise<DocxImage | null> {
  try {
    const inline = decodeDataUrl(src)
    const resolved = inline ?? (ctx.resolveImage ? await ctx.resolveImage(src) : null)
    if (!resolved) return null
    return await normalizeImage(resolved.data, resolved.mime)
  } catch {
    return null
  }
}

function imageParagraph(image: DocxImage, width: number, height: number): Paragraph {
  return new Paragraph({
    children: [new ImageRun({
      data: image.data,
      type: image.type,
      transformation: { width, height },
    })],
  })
}

function failedImageParagraph(src: string, alt?: string): Paragraph {
  return new Paragraph({ children: [new TextRun({ text: `[Image failed to load: ${alt || src}]` })] })
}

export async function imageToDocxParagraph(
  node: PmNode,
  ctx: ExportContext,
  walkCtx?: WalkContext,
): Promise<Paragraph | null> {
  const src = node.attrs?.src as string | undefined
  const alt = node.attrs?.alt as string | undefined
  if (!src) return null

  const width = (node.attrs?.width as number | undefined) ?? 600
  const height = (node.attrs?.height as number | undefined) ?? 400

  // The document walk pre-resolves every image so list/heading/table mappers
  // (which are synchronous) can embed them too (issues #371, #382).
  const preResolved = walkCtx?.images?.get(node)
  if (preResolved !== undefined) {
    return preResolved ? imageParagraph(preResolved, width, height) : failedImageParagraph(src, alt)
  }

  try {
    const inline = decodeDataUrl(src)
    const resolver = ctx.resolveImage
    let resolved: DecodedImage
    if (inline) {
      resolved = inline
    } else if (resolver) {
      resolved = await resolver(src)
    } else {
      return new Paragraph({ children: [new TextRun({ text: `[Image: ${alt || src}]` })] })
    }

    const image = await normalizeImage(resolved.data, resolved.mime)
    if (!image) return failedImageParagraph(src, alt)
    return imageParagraph(image, width, height)
  } catch {
    return failedImageParagraph(src, alt)
  }
}
