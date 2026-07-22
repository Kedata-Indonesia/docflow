import { ImageRun, Paragraph, TextRun } from 'docx'
import type { ExportContext } from '../types.js'
import type { PmNode } from './nodes.js'

export async function imageToDocxParagraph(
  node: PmNode,
  ctx: ExportContext,
): Promise<Paragraph | null> {
  const src = node.attrs?.src as string | undefined
  const alt = node.attrs?.alt as string | undefined
  if (!src) return null

  try {
    if (!ctx.resolveImage) {
      return new Paragraph({ children: [new TextRun({ text: `[Image: ${alt || src}]` })] })
    }
    const resolved = await ctx.resolveImage(src)
    const width = resolved.width ?? (node.attrs?.width as number | undefined) ?? 600
    const height = resolved.height ?? (node.attrs?.height as number | undefined) ?? 400

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
