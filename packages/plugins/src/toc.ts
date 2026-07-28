import { Extension, Node, mergeAttributes } from '@tiptap/core'
import { definePlugin } from '@kedata-indonesia/docflow-core'
import type { Editor } from '@tiptap/core'
import type { Schema, Node as PMNode } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'

export interface TocHeading {
  level: number
  text: string
  pos: number
}

function collectHeadingsFromDoc(doc: PMNode): TocHeading[] {
  const headings: TocHeading[] = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      const level = node.attrs.level as number
      if (level === 1 || level === 2 || level === 3) {
        headings.push({ level, text: node.textContent.trim(), pos })
      }
    }
    return true
  })
  return headings
}

/**
 * Walk the doc and collect H1–H3 headings in document order. Same algorithm
 * as the outline sidebar (TOCSidebar.vue) — positions are captured now and go
 * stale as the doc is edited; refresh to recapture.
 */
export function collectHeadings(editor: Editor): TocHeading[] {
  return collectHeadingsFromDoc(editor.state.doc)
}

/**
 * Page-number resolver, captured once per generation. Mirrors the geometry in
 * DocsEditor.updatePageStats: a heading's page is 1 + the number of page
 * breakers above its y-coordinate, measured against the pagination wrapper
 * inside the editor DOM. Degrades to `null` (no page numbers rendered) when
 * there is no pagination — pageless mode or a headless editor.
 */
type PageResolver = (pos: number) => number | null

function createPageResolver(editor: Editor): PageResolver {
  let breakers: HTMLElement[] = []
  try {
    const pagination = editor.view.dom.querySelector('[data-rm-pagination]')
    if (pagination) {
      breakers = Array.from(pagination.querySelectorAll('.rm-page-break .breaker'))
        .filter((el): el is HTMLElement => el instanceof HTMLElement)
    }
  } catch { /* no pagination DOM — pageless */ }
  if (breakers.length === 0) return () => null

  const editorDom = editor.view.dom
  return (pos) => {
    try {
      const coords = editor.view.coordsAtPos(pos)
      const top = coords.top - editorDom.getBoundingClientRect().top + editorDom.scrollTop
      let page = 1
      for (const breaker of breakers) {
        if (top < breaker.offsetTop) return page
        page++
      }
      return page
    } catch {
      return null
    }
  }
}

function buildTocEntryNodes(schema: Schema, headings: TocHeading[], pageFor: PageResolver): PMNode[] {
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

function buildTocContentJSON(editor: Editor) {
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
function applyTocRegeneration(editor: Editor, tr: Transaction): boolean {
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

  const entries = buildTocEntryNodes(editor.schema, collectHeadingsFromDoc(tr.doc), createPageResolver(editor))
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

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    toc: {
      /** Insert a table-of-contents block prefilled with the current H1–H3 headings. */
      insertToc: () => ReturnType
      /** Regenerate the entries of every toc block from the current headings. */
      refreshToc: () => ReturnType
    }
  }
}

export const TocCommandsExtension = Extension.create({
  name: 'tocCommands',

  addCommands() {
    return {
      insertToc:
        () =>
        ({ editor, chain }): boolean =>
          chain()
            .focus()
            .insertContent({ type: 'toc', content: buildTocContentJSON(editor) })
            .run(),
      refreshToc:
        () =>
        ({ editor, tr }): boolean =>
          applyTocRegeneration(editor, tr),
    }
  },
})

/**
 * A page number inside a TOC entry — an inline atom holding the page captured
 * at generation time (GDocs "with page numbers": stale until refresh). Being
 * real node content, it serializes to JSON (attrs.page) and to HTML as an
 * actual `<span>` with the number as text, so exports show it even without
 * the editor stylesheet.
 */
export const TocPageNumNode = Node.create({
  name: 'tocPageNum',
  inline: true,
  group: 'inline',
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      page: {
        default: null,
        parseHTML: el => Number(el.textContent) || null,
        renderHTML: attrs => (attrs.page ? { 'data-page': attrs.page } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-toc-page]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, {
      'data-toc-page': '',
      class: 'docs-toc__page',
    }), String(node.attrs.page ?? '')]
  },
})

/**
 * One TOC entry — a paragraph variant carrying the heading level (CSS indents
 * by it) and the heading's doc position at generation time (click-to-jump).
 * Only valid inside a `toc` block (no group), so regular paragraphs never
 * turn into entries and entries never leak into the doc body.
 */
export const TocEntryNode = Node.create({
  name: 'tocEntry',
  content: 'inline*',
  defining: true,

  addAttributes() {
    return {
      level: {
        default: 1,
        parseHTML: el => Number(el.getAttribute('data-level') ?? 1),
        renderHTML: attrs => ({ 'data-level': attrs.level }),
      },
      pos: {
        default: 0,
        parseHTML: el => Number(el.getAttribute('data-pos') ?? 0),
        renderHTML: attrs => ({ 'data-pos': attrs.pos }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'p[data-toc-entry]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['p', mergeAttributes(HTMLAttributes, {
      'data-toc-entry': '',
      class: 'docs-toc__entry',
    }), 0]
  },
})

/**
 * Table of contents — a container block holding real generated entry
 * paragraphs (one per H1–H3). The entries are real document content, so
 * export/print/Yjs/undo all work without special-casing; the `0` hole in
 * renderHTML is what keeps them in the serialized output. The NodeView adds
 * only the chrome (caption + refresh button) around the contentDOM.
 */
export const TocNode = Node.create({
  name: 'toc',
  group: 'block',
  content: 'tocEntry+',
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-toc]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, {
      'data-toc': '',
      class: 'docs-toc',
    }), 0]
  },

  // Return type cast to `any` to bypass TipTap's strict NodeViewRenderer typing
  // (same pattern as FootnoteNode / BibliographyNode).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addNodeView(): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (props: any) => {
      const editor = props.editor as Editor

      const dom = document.createElement('div')
      dom.className = 'docs-toc'
      dom.setAttribute('data-toc', '')

      const chrome = document.createElement('div')
      chrome.className = 'docs-toc__chrome'
      chrome.contentEditable = 'false'

      const caption = document.createElement('span')
      caption.className = 'docs-toc__caption'
      caption.textContent = 'Table of contents'

      const refresh = document.createElement('button')
      refresh.type = 'button'
      refresh.className = 'docs-toc__refresh'
      refresh.title = 'Refresh table of contents'
      refresh.textContent = '⟳'

      chrome.appendChild(caption)
      chrome.appendChild(refresh)

      const contentDOM = document.createElement('div')
      contentDOM.className = 'docs-toc__entries'

      dom.appendChild(chrome)
      dom.appendChild(contentDOM)

      const onRefresh = (event: MouseEvent) => {
        event.preventDefault()
        regenerateToc(editor)
      }
      // Click an entry → jump to its heading. Positions were captured at
      // generation time and may be stale between refreshes — clamp to the doc
      // size so a stale pos can never throw (same best-effort as the sidebar).
      const onEntryClick = (event: MouseEvent) => {
        const entry = (event.target as HTMLElement | null)?.closest?.('[data-toc-entry]')
        if (!entry) return
        const pos = Number((entry as HTMLElement).getAttribute('data-pos') ?? 0)
        const clamped = Math.min(Math.max(0, pos), editor.state.doc.content.size)
        editor.chain().focus().setTextSelection(clamped).scrollIntoView().run()
      }

      refresh.addEventListener('click', onRefresh)
      dom.addEventListener('click', onEntryClick)

      return {
        dom,
        contentDOM,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        update(updatedNode: any): boolean {
          return updatedNode?.type?.name === 'toc'
        },
        destroy() {
          refresh.removeEventListener('click', onRefresh)
          dom.removeEventListener('click', onEntryClick)
        },
      }
    }
  },
})

export const tocPlugin = definePlugin({
  id: 'toc',
  tiptapExtensions: [TocPageNumNode, TocEntryNode, TocNode, TocCommandsExtension],
  slashCommands: [{ name: 'Table of contents', description: 'Daftar isi', command: 'insertToc' }],
  commands: {
    insertToc: (editor: Editor) => editor.commands.insertToc(),
    refreshToc: (editor: Editor) => regenerateToc(editor),
  },
})
