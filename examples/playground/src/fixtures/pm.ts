/**
 * Minimal ProseMirror-shaped document builders for the playground fixtures.
 *
 * The library never constructs documents for the host; these helpers only keep
 * the sample presets readable (one call per block instead of raw JSON).
 */

export interface PmMark {
  type: string
  attrs?: Record<string, unknown>
}

export interface PmNode {
  type: string
  attrs?: Record<string, unknown>
  content?: PmNode[]
  text?: string
  marks?: PmMark[]
}

export interface PmDoc {
  type: 'doc'
  content: PmNode[]
}

export const t = (text: string, marks?: PmMark[]): PmNode =>
  marks ? { type: 'text', text, marks } : { type: 'text', text }

export const bold = (text: string): PmNode => t(text, [{ type: 'bold' }])

export const h = (level: number, text: string): PmNode => ({
  type: 'heading',
  attrs: { level },
  content: [t(text)],
})

export const p = (text: string): PmNode => ({
  type: 'paragraph',
  content: text ? [t(text)] : [],
})

export const lead = (text: string): PmNode => ({ type: 'paragraph', content: [bold(text)] })

export const ul = (...items: string[]): PmNode => ({
  type: 'bulletList',
  content: items.map((item) => ({ type: 'listItem', content: [p(item)] })),
})

export const ol = (...items: string[]): PmNode => ({
  type: 'orderedList',
  content: items.map((item) => ({ type: 'listItem', content: [p(item)] })),
})

export const quote = (text: string): PmNode => ({ type: 'blockquote', content: [p(text)] })

export const doc = (...blocks: PmNode[]): PmDoc => ({ type: 'doc', content: blocks })

// Inline footnote node (`packages/plugins/src/footnote.ts`) — `content` is the
// note body rendered inside the page's footnote area.
export const fn = (content: string): PmNode => ({ type: 'footnote', attrs: { content } })

/** Paragraph built from mixed inline nodes (text + footnotes). */
export const inline = (...nodes: PmNode[]): PmNode => ({ type: 'paragraph', content: nodes })

/** Ordered list from pre-built list items (each item may carry a footnote). */
export const olItems = (...items: PmNode[]): PmNode => ({
  type: 'orderedList',
  content: items,
})

export const li = (...nodes: PmNode[]): PmNode => ({
  type: 'listItem',
  content: [inline(...nodes)],
})
