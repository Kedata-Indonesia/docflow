import type { Editor } from '@tiptap/core'
import type { Schema, Node as PMNode } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import {
  collectHeadings,
  collectHeadingsFromDoc,
  createPageResolver,
  type PageResolver,
  type TocHeading,
} from './headingCollect.js'

/** Build the ProseMirror nodes for a `toc` block from the collected headings. */
export function buildTocEntryNodes(
  schema: Schema,
  headings: TocHeading[],
  pageFor: PageResolver,
): PMNode[] {
  const entryType = schema.nodes.tocEntry
  if (headings.length === 0) {
    // 'tocEntry+' requires at least one child — an empty entry acts as the
    // placeholder until the first refresh with headings.
    return [entryType.create({ level: 1, pos: 0 })]
  }
  return headings.map((h) => {
    const content: PMNode[] = []
    if (h.text) content.push(schema.text(h.text))
    const page = pageFor(h.pos)
    if (page !== null) content.push(schema.nodes.tocPageNum.create({ page }))
    return entryType.create({ level: h.level, pos: h.pos }, content)
  })
}

/** JSON form of a fresh `toc` block — used by `insertToc`. */
export function buildTocContentJSON(editor: Editor): Record<string, unknown>[] {
  const headings = collectHeadings(editor)
  if (headings.length === 0) {
    return [{ type: 'tocEntry', attrs: { level: 1, pos: 0 } }]
  }
  const pageFor = createPageResolver(editor)
  return headings.map((h) => {
    const content: Record<string, unknown>[] = []
    if (h.text) content.push({ type: 'text', text: h.text })
    const page = pageFor(h.pos)
    if (page !== null) content.push({ type: 'tocPageNum', attrs: { page } })
    return {
      type: 'tocEntry',
      attrs: { level: h.level, pos: h.pos },
      ...(content.length > 0 ? { content } : {}),
    }
  })
}

/**
 * Write fresh entries for every toc block into `tr` (one transaction → a
 * single undo step, converges via Yjs). Like Google Docs, refreshing
 * overwrites any manual edits to entries. Page numbers are resolved from the
 * CURRENT layout — inserting/editing shifts pages until the next refresh.
 */
export function applyTocRegeneration(editor: Editor, tr: Transaction): boolean {
  const tocType = editor.schema.nodes.toc
  if (!tocType) return false

  // Collect targets first, then replace back-to-front so the positions of
  // earlier toc blocks stay valid while the doc shrinks/grows behind them.
  const targets: { pos: number; nodeSize: number }[] = []
  tr.doc.descendants((node, pos) => {
    if (node.type.name === 'toc') {
      targets.push({ pos, nodeSize: node.nodeSize })
      return false
    }
    return true
  })
  if (targets.length === 0) return false

  const entries = buildTocEntryNodes(
    editor.schema,
    collectHeadingsFromDoc(tr.doc),
    createPageResolver(editor),
  )
  for (const target of targets.reverse()) {
    tr.replaceWith(target.pos, target.pos + target.nodeSize, tocType.create(null, entries))
  }
  return true
}

/** Standalone refresh (refresh button, plugin action): builds and dispatches its own transaction. */
export function regenerateToc(editor: Editor): boolean {
  const tr = editor.state.tr
  if (!applyTocRegeneration(editor, tr)) return false
  editor.view.dispatch(tr)
  return true
}
