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
  TabStopType,
  TabStopPosition,
  ImageRun,
} from 'docx'
import type { ParagraphChild } from 'docx'
import type { CitationExportPort } from '../types.js'
import type { DocxImage } from './image.js'
import { citeHtmlToRuns, footnoteBodyRuns, type FootnoteCollector } from './citation.js'
import { displayEquationChildren, inlineEquationRuns } from './equation.js'

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
  /** Derived display-equation numbers (C2), keyed by node object. */
  equationNumbers?: Map<PmNode, number>
  /**
   * Images pre-resolved by the document walk (issue #371/#382). `null` means
   * the image could not be decoded — emit the placeholder text instead.
   */
  images?: WeakMap<PmNode, DocxImage | null>
}

/** Display names for the code-block language attribute (issue #247). */
const CODE_LANGUAGE_LABELS: Record<string, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  go: 'Go',
  rust: 'Rust',
  java: 'Java',
  c: 'C',
  cpp: 'C++',
  csharp: 'C#',
  sql: 'SQL',
  bash: 'Bash',
  shell: 'Shell',
  json: 'JSON',
  yaml: 'YAML',
  xml: 'HTML',
  css: 'CSS',
  markdown: 'Markdown',
  php: 'PHP',
  ruby: 'Ruby',
  kotlin: 'Kotlin',
  swift: 'Swift',
  plaintext: 'Plain text',
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

export function inlineNodesToRuns(node: PmNode, walkCtx?: WalkContext): ParagraphChild[] {
  const runs: ParagraphChild[] = []
  if (!node.content) return runs
  for (const child of node.content) {
    if (child.type === 'text') {
      runs.push(...textToRun(child.text || '', child.marks || []))
    } else if (child.type === 'hardBreak') {
      runs.push(new TextRun({ text: '', break: 1 }))
    } else if (child.type === 'image') {
      // Use the document walk's pre-resolved bytes so images inside list
      // items, headings and table cells survive too (issues #371, #382).
      const image = walkCtx?.images?.get(child)
      if (image === null) {
        runs.push(new TextRun({ text: `[Image failed to load: ${String(child.attrs?.alt ?? child.attrs?.src ?? '')}]` }))
      } else if (image) {
        runs.push(new ImageRun({
          data: image.data,
          type: image.type,
          transformation: {
            width: (child.attrs?.width as number | undefined) ?? 600,
            height: (child.attrs?.height as number | undefined) ?? 400,
          },
        }))
      }
    } else if (child.type === 'inlineEquation') {
      // Native Word equation (OMML) when docx can parse the LaTeX.
      runs.push(...inlineEquationRuns(String(child.attrs?.latex ?? '')))
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

/** Paragraphs for a bullet/ordered list, nested lists included. */
export function listToParagraphs(node: PmNode, walkCtx?: WalkContext, depth = 0): Paragraph[] {
  const type = node.type === 'orderedList' ? 'ordered' : 'bullet'
  const paragraphs: Paragraph[] = []
  // A list may start at any number (`start: 5`); numbering must follow it
  // instead of always restarting at 1 (issue #385).
  const start = Number(node.attrs?.start ?? 1)
  let level = Number.isFinite(start) && start > 0 ? start - 1 : 0
  for (const item of node.content ?? []) {
    if (item.type !== 'listItem') continue
    paragraphs.push(...mapBlockNode(item, { type, level, depth }, walkCtx))
    level++
  }
  return paragraphs
}

export function mapBlockNode(
  node: PmNode,
  listContext?: { type: 'bullet' | 'ordered'; level: number; depth?: number },
  walkCtx?: WalkContext,
): Paragraph[] {
  const align = mapAlignment(node.attrs?.textAlign)

  switch (node.type) {
    case 'paragraph': {
      // An empty paragraph is content: it is the blank line the author pressed
      // Enter for. Dropping it reflows the exported document (issue #371).
      const children = inlineNodesToRuns(node, walkCtx)
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
      const paragraphs: Paragraph[] = []
      const language = typeof node.attrs?.language === 'string' ? node.attrs.language : ''
      // Language caption (issue #247) — DOCX keeps the monospace code body and
      // adds a small label; token colours stay a separate, larger concern.
      if (language && language !== 'plaintext') {
        paragraphs.push(new Paragraph({
          children: [new TextRun({
            text: CODE_LANGUAGE_LABELS[language] ?? language,
            italics: true,
            size: 18,
            color: '6B7280',
          })],
        }))
      }
      paragraphs.push(new Paragraph({ children, style: 'Code', alignment: align }))
      return paragraphs
    }
    case 'bulletList':
    case 'orderedList': {
      // Lists inside a table cell (or any other block context) are blocks too;
      // without this case they fell through to the inline mapper and vanished
      // (issue #382).
      return listToParagraphs(node, walkCtx)
    }
    case 'horizontalRule': {
      return [new Paragraph({
        border: { bottom: { color: 'D1D5DB', size: 6, style: BorderStyle.SINGLE } },
      })]
    }
    case 'pageBreak': {
      return [new Paragraph({ children: [new PageBreak()] })]
    }
    case 'displayEquation': {
      const latex = String(node.attrs?.latex ?? '')
      const number = walkCtx?.equationNumbers?.get(node)
      return [new Paragraph({
        children: displayEquationChildren(latex, number),
        alignment: AlignmentType.CENTER,
        tabStops: number ? [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }] : undefined,
      })]
    }
    case 'footnote': {
      // A footnote that arrives as a block (e.g. pasted/imported content, or a
      // top-level insert) must behave exactly like an inline one: emit a
      // numbered reference in the body and collect the body into the document's
      // real footnotes. Never write the footnote text into the body.
      if (!walkCtx?.footnotes) return []
      const id = walkCtx.footnotes.add(footnoteBodyRuns(node, walkCtx.citation))
      return [new Paragraph({ children: [new FootnoteReferenceRun(id)] })]
    }
    case 'listItem': {
      // A list item's children are blocks (a paragraph, plus optional nested
      // lists). The inline mapper only walks inline nodes, so reading the item
      // with it silently drops the item's entire text.
      const runs: ParagraphChild[] = []
      const nested: Paragraph[] = []
      for (const child of node.content ?? []) {
        if (child.type === 'bulletList' || child.type === 'orderedList') {
          nested.push(...listToParagraphs(child, walkCtx, (listContext?.depth ?? 0) + 1))
        } else if (child.type === 'paragraph') {
          runs.push(...inlineNodesToRuns(child, walkCtx))
        } else {
          nested.push(...mapBlockNode(child, undefined, walkCtx))
        }
      }
      if (!listContext) {
        return runs.length > 0 ? [new Paragraph({ children: runs, alignment: align }), ...nested] : nested
      }
      const prefix = listContext.type === 'ordered' ? `${listContext.level + 1}. ` : '• '
      return [
        new Paragraph({
          children: [new TextRun({ text: prefix }), ...runs],
          alignment: align,
          indent: listContext.depth ? { left: 720 * (listContext.depth + 1) } : undefined,
        }),
        ...nested,
      ]
    }
    default: {
      const children = inlineNodesToRuns(node, walkCtx)
      return children.length > 0 ? [new Paragraph({ children, alignment: align })] : []
    }
  }
}
