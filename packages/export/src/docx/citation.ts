import { Paragraph, TextRun, HeadingLevel } from 'docx'
import type { PmNode } from './nodes.js'

/**
 * Citation helpers for the DOCX mapper (Phase 6D). citeproc output reaches us
 * already sanitized to a tiny allowlist of formatting tags (see
 * CiteEngine.sanitizeCiteprocHtml): <i>, <em>, <b>, <strong>, <sup>, <sub>,
 * <span style="font-variant:small-caps;">, <nobr>. This module converts such
 * fragments into styled TextRuns without any DOM dependency (works in the
 * browser and in Node).
 */

interface RunStyle {
  italics?: boolean
  bold?: boolean
  superScript?: boolean
  subScript?: boolean
  smallCaps?: boolean
}

const TAG_STYLE: Record<string, Partial<RunStyle>> = {
  i: { italics: true },
  em: { italics: true },
  b: { bold: true },
  strong: { bold: true },
  sup: { superScript: true },
  sub: { subScript: true },
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

/** Convert a sanitized citeproc HTML fragment into styled DOCX runs. */
export function citeHtmlToRuns(html: string): TextRun[] {
  const runs: TextRun[] = []
  const styleStack: RunStyle[] = [{}]

  const currentStyle = (): RunStyle => styleStack[styleStack.length - 1]

  // Split into tags and text, preserving order.
  const tokens = html.split(/(<[^>]+>)/g).filter(Boolean)
  for (const token of tokens) {
    if (token.startsWith('<')) {
      const closing = /^<\//.test(token)
      const tagMatch = token.match(/^<\/?([a-zA-Z]+)/)
      const tag = tagMatch?.[1]?.toLowerCase() ?? ''
      if (closing) {
        if (styleStack.length > 1) styleStack.pop()
        continue
      }
      const style: Partial<RunStyle> = TAG_STYLE[tag] ?? {}
      if (tag === 'span' && /small-caps/.test(token)) style.smallCaps = true
      styleStack.push({ ...currentStyle(), ...style })
      continue
    }
    const text = decodeEntities(token)
    if (text) runs.push(new TextRun({ text, ...currentStyle() }))
  }

  return runs
}

/**
 * Collects real DOCX footnotes during the document walk. Citation-backed
 * footnotes (Chicago notes-bib) and free-text footnotes both become genuine
 * Word footnotes — numbered automatically by the renderer.
 */
export class FootnoteCollector {
  private nextId = 1
  private readonly defs = new Map<number, Paragraph[]>()

  /** Register a footnote body; returns the id to reference in-text. */
  add(bodyRuns: TextRun[]): number {
    const id = this.nextId++
    this.defs.set(id, [new Paragraph({ children: bodyRuns })])
    return id
  }

  /** Shape expected by the docx Document `footnotes` option. */
  toDocumentOption(): Record<number, { children: Paragraph[] }> {
    return Object.fromEntries([...this.defs.entries()].map(([id, children]) => [id, { children }]))
  }
}

/** Body runs for a footnote node — citation-backed (derived) or free text. */
export function footnoteBodyRuns(
  node: PmNode,
  citation?: { renderCitation: (citationId: string) => string },
): TextRun[] {
  const sourceId = node.attrs?.sourceId as string | undefined
  if (sourceId && citation) {
    const citationId = (node.attrs?.citationId as string | undefined) ?? ''
    const html = citation.renderCitation(citationId)
    if (html) return citeHtmlToRuns(html)
    return [new TextRun({ text: '' })]
  }
  const content = (node.attrs?.content as string | undefined) ?? ''
  return [new TextRun({ text: content })]
}

/**
 * Bibliography block: heading + entries with a standard hanging indent.
 *
 * `showHeading`/`headingText` mirror the bibliography node's presentation attrs
 * (a host may place the block under its own section heading, e.g. an NA's
 * "Daftar Pustaka"). Defaults keep the previous output.
 */
export function bibliographyToParagraphs(
  entries: string[],
  options: { showHeading?: boolean; headingText?: string } = {},
): Paragraph[] {
  const paragraphs: Paragraph[] = []
  if (options.showHeading !== false) {
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: options.headingText || 'Bibliography', bold: true })],
        heading: HeadingLevel.HEADING_2,
      }),
    )
  }
  for (const entry of entries) {
    paragraphs.push(
      new Paragraph({
        children: citeHtmlToRuns(entry),
        indent: { left: 720, hanging: 720 },
      }),
    )
  }
  return paragraphs
}
