import {
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  UnderlineType,
  ExternalHyperlink,
  BorderStyle,
  PageBreak,
  FootnoteReferenceRun,
} from 'docx'
import type { CitationExportPort } from '../types.js'
import { citeHtmlToRuns, footnoteBodyRuns, type FootnoteCollector } from './citation.js'

export type PmMark = { type: string; attrs?: Record<string, unknown> }
export type PmNode = {
  type: string
  attrs?: Record<string, unknown>
  content?: PmNode[]
  text?: string
  marks?: PmMark[]
}

/** Optional per-walk context for derived content (citations, footnotes). */
export interface WalkContext {
  citation?: CitationExportPort
  footnotes?: FootnoteCollector
}

export function mapAlignment(value: unknown): (typeof AlignmentType)[keyof typeof AlignmentType] | undefined {
  switch (value) {
    case 'left': return AlignmentType.LEFT
    case 'center': return AlignmentType.CENTER
    case 'right': return AlignmentType.RIGHT
    case 'justify': return AlignmentType.JUSTIFIED
    default: return undefined
  }
}

export function mapHeadingLevel(level: unknown): (typeof HeadingLevel)[keyof typeof HeadingLevel] | undefined {
  switch (level) {
    case 1: return HeadingLevel.HEADING_1
    case 2: return HeadingLevel.HEADING_2
    case 3: return HeadingLevel.HEADING_3
    case 4: return HeadingLevel.HEADING_4
    case 5: return HeadingLevel.HEADING_5
    case 6: return HeadingLevel.HEADING_6
    default: return undefined
  }
}

export function textToRun(text: string, marks: PmMark[] = []): (TextRun | ExternalHyperlink)[] {
  const options: Record<string, unknown> = { text }
  let hyperlink: { href: string; target?: string } | null = null

  for (const mark of marks) {
    switch (mark.type) {
      case 'bold': options.bold = true; break
      case 'italic': options.italics = true; break
      case 'underline': options.underline = { type: UnderlineType.SINGLE }; break
      case 'strike': options.strike = true; break
      case 'code': options.font = 'Courier New'; break
      case 'textStyle': {
        const fontSize = mark.attrs?.fontSize as string | undefined
        if (fontSize) {
          const size = parseInt(fontSize, 10)
          if (!isNaN(size)) options.size = size * 2
        }
        break
      }
      case 'link': {
        const href = mark.attrs?.href as string | undefined
        if (href) hyperlink = { href, target: mark.attrs?.target as string | undefined }
        break
      }
      default: break
    }
  }

  const run = new TextRun(options as ConstructorParameters<typeof TextRun>[0])
  if (hyperlink) {
    return [new ExternalHyperlink({
      children: [run],
      link: hyperlink.href,
    })]
  }
  return [run]
}

export function inlineNodesToRuns(node: PmNode, walkCtx?: WalkContext): (TextRun | ExternalHyperlink | FootnoteReferenceRun)[] {
  const runs: (TextRun | ExternalHyperlink | FootnoteReferenceRun)[] = []
  if (!node.content) return runs
  for (const child of node.content) {
    if (child.type === 'text') {
      runs.push(...textToRun(child.text || '', child.marks || []))
    } else if (child.type === 'hardBreak') {
      runs.push(new TextRun({ text: '', break: 1 }))
    } else if (child.type === 'image') {
      // Images are handled separately by the block mapper.
      continue
    } else if (child.type === 'citation') {
      // Derived text — the host's CiteEngine already rendered it (6D).
      const citationId = (child.attrs?.citationId as string | undefined) ?? ''
      const html = walkCtx?.citation?.renderCitation(citationId) ?? ''
      if (html) runs.push(...citeHtmlToRuns(html))
    } else if (child.type === 'footnote' && walkCtx?.footnotes) {
      // Real DOCX footnote: reference in-text, body collected for the
      // Document-level footnotes option (citation-backed or free text).
      const id = walkCtx.footnotes.add(footnoteBodyRuns(child, walkCtx.citation))
      runs.push(new FootnoteReferenceRun(id))
    }
  }
  return runs
}

export function mapBlockNode(
  node: PmNode,
  listContext?: { type: 'bullet' | 'ordered'; level: number },
  walkCtx?: WalkContext,
): Paragraph[] {
  const align = mapAlignment(node.attrs?.textAlign)

  switch (node.type) {
    case 'paragraph': {
      const children = inlineNodesToRuns(node, walkCtx)
      if (children.length === 0) return []
      return [new Paragraph({ children, alignment: align })]
    }
    case 'heading': {
      const children = inlineNodesToRuns(node, walkCtx)
      const heading = mapHeadingLevel(node.attrs?.level)
      return [new Paragraph({ children, heading, alignment: align })]
    }
    case 'blockquote': {
      const children = inlineNodesToRuns(node, walkCtx)
      return [new Paragraph({ children, indent: { left: 720 }, alignment: align })]
    }
    case 'codeBlock': {
      const children = inlineNodesToRuns(node, walkCtx)
      return [new Paragraph({ children, style: 'Code', alignment: align })]
    }
    case 'horizontalRule': {
      return [new Paragraph({
        border: { bottom: { color: 'D1D5DB', size: 6, style: BorderStyle.SINGLE } },
      })]
    }
    case 'pageBreak': {
      return [new Paragraph({ children: [new PageBreak()] })]
    }
    case 'footnote': {
      // Footnotes are collected separately by the assembly; render as reference text here.
      const content = node.attrs?.content as string | undefined
      if (content) {
        return [new Paragraph({ children: [new TextRun({ text: `[1] ${content}` })] })]
      }
      return []
    }
    case 'listItem': {
      const children = inlineNodesToRuns(node, walkCtx)
      if (!listContext) return [new Paragraph({ children, alignment: align })]
      const prefix = listContext.type === 'ordered' ? `${listContext.level + 1}. ` : '• '
      return [new Paragraph({
        children: [new TextRun({ text: prefix }), ...children],
        alignment: align,
      })]
    }
    default: {
      const children = inlineNodesToRuns(node, walkCtx)
      return children.length > 0 ? [new Paragraph({ children, alignment: align })] : []
    }
  }
}
