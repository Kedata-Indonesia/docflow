import { Document, Packer, Paragraph, TextRun, ExternalHyperlink, PageOrientation, convertInchesToTwip } from 'docx'
import type { ExportContext, PageGeometry } from '../types.js'
import { listToParagraphs, mapBlockNode, mapAlignment, inlineNodesToRuns, type PmNode, type WalkContext } from './nodes.js'
import { tableToDocxTable } from './table.js'
import { imageToDocxParagraph } from './image.js'
import { FootnoteCollector, bibliographyToParagraphs } from './citation.js'

/** CSS pixels → twips (1440 twips per inch ÷ 96 px per inch). */
const twipsFromPx = (px: number): number => Math.round(px * 15)

/**
 * Section page properties. `ctx.geometry` is optional and uses **CSS pixels** —
 * the unit the editor's page surface works in (94 px = 1 in, A4 = 794×1123) —
 * so a host that knows the page setup gets a page that matches the editor.
 * Without geometry we keep the historical default (no explicit page size,
 * 1-inch margins on all four sides) so existing output is unchanged.
 */
function pageProperties(geometry?: PageGeometry) {
  if (!geometry) {
    return {
      page: {
        margin: {
          top: convertInchesToTwip(1),
          right: convertInchesToTwip(1),
          bottom: convertInchesToTwip(1),
          left: convertInchesToTwip(1),
        },
      },
    }
  }
  const landscape = geometry.orientation === 'landscape'
  // `PageGeometry` carries the page's actual dimensions, already swapped for
  // landscape by the editor's page surface. docx expects the *portrait* pair and
  // performs the swap itself when `orientation` is landscape, so un-swap here.
  const width = landscape ? geometry.pageHeight : geometry.pageWidth
  const height = landscape ? geometry.pageWidth : geometry.pageHeight
  return {
    page: {
      size: {
        width: twipsFromPx(width),
        height: twipsFromPx(height),
        orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
      },
      margin: {
        top: twipsFromPx(geometry.margins.top),
        right: twipsFromPx(geometry.margins.right),
        bottom: twipsFromPx(geometry.margins.bottom),
        left: twipsFromPx(geometry.margins.left),
      },
    },
  }
}

async function docToDocxDocument(title: string, doc: PmNode, ctx: ExportContext): Promise<Document> {
  const children: (Paragraph | ReturnType<typeof tableToDocxTable>)[] = []

  // Derived-content walk context (Phase 6D): the host's citation port renders
  // citation/bibliography text; real DOCX footnotes are collected here and
  // attached to the Document below.
  const walkCtx: WalkContext = { citation: ctx.citation, footnotes: new FootnoteCollector() }

  async function processBlock(node: PmNode) {
    if (!node.content) return

    if (node.type === 'bulletList' || node.type === 'orderedList') {
      children.push(...listToParagraphs(node, walkCtx))
      return
    }

    for (const child of node.content) {
      if (child.type === 'table') {
        const table = tableToDocxTable(child)
        if (table) children.push(table)
      } else if (child.type === 'image') {
        const img = await imageToDocxParagraph(child, ctx)
        if (img) children.push(img)
      } else if (child.type === 'bibliography') {
        // Fully derived block (Phase 6D): rendered from the active CSL style.
        if (ctx.citation) children.push(...bibliographyToParagraphs(ctx.citation.getBibliography()))
      } else if (child.type === 'footnote') {
        children.push(...mapBlockNode(child, undefined, walkCtx))
      } else if (child.type === 'bulletList' || child.type === 'orderedList') {
        children.push(...listToParagraphs(child, walkCtx))
      } else if (child.type === 'paragraph') {
        // Split inline images out of the paragraph so they can be embedded.
        const runs: (TextRun | ExternalHyperlink)[] = []
        const imageNodes: PmNode[] = []
        for (const inline of child.content || []) {
          if (inline.type === 'image') {
            imageNodes.push(inline)
          } else {
            // text, hardBreak, citation, footnote — handled by the shared
            // inline mapper (citations render derived text, footnotes become
            // real DOCX footnotes).
            runs.push(...inlineNodesToRuns({ type: 'paragraph', content: [inline] }, walkCtx) as (TextRun | ExternalHyperlink)[])
          }
        }
        if (runs.length > 0) {
          children.push(new Paragraph({ children: runs, alignment: mapAlignment(child.attrs?.textAlign) }))
        }
        for (const imageNode of imageNodes) {
          const img = await imageToDocxParagraph(imageNode, ctx)
          if (img) children.push(img)
        }
      } else {
        children.push(...mapBlockNode(child, undefined, walkCtx))
      }
    }
  }

  await processBlock(doc)

  const paragraphs = children.filter((c): c is Paragraph => c instanceof Paragraph)
  const tables = children.filter((c): c is NonNullable<ReturnType<typeof tableToDocxTable>> => c !== null && !(c instanceof Paragraph))

  if (paragraphs.length === 0 && tables.length === 0) {
    children.push(new Paragraph(''))
  }

  const fileChildren = children.filter((c): c is Paragraph | NonNullable<ReturnType<typeof tableToDocxTable>> => c !== null)

  return new Document({
    title,
    styles: {
      paragraphStyles: [
        {
          id: 'Code',
          name: 'Code',
          basedOn: 'Normal',
          run: { font: 'Courier New' },
        },
      ],
    },
    // Real Word footnotes collected during the walk (Phase 6D) — citation-
    // backed (Chicago notes-bib) and free-text footnotes alike.
    footnotes: walkCtx.footnotes?.toDocumentOption(),
    sections: [{
      properties: pageProperties(ctx.geometry),
      children: fileChildren,
    }],
  })
}

export async function exportDocx(ctx: ExportContext): Promise<Blob> {
  const doc = ctx.doc as PmNode
  const docxDoc = await docToDocxDocument(ctx.title, doc, ctx)
  return Packer.toBlob(docxDoc)
}
