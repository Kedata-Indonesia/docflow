import { Extension, Node, mergeAttributes } from '@tiptap/core'
import { definePlugin } from '@kedata-indonesia/docflow-core'
import type { Editor, NodeViewRenderer } from '@tiptap/core'
import { buildTocContentJSON, applyTocRegeneration, regenerateToc } from './toc/tocContent.js'
import { createTocNodeView } from './toc/tocNodeView.js'

export { collectHeadings, type TocHeading } from './toc/headingCollect.js'
export { regenerateToc } from './toc/tocContent.js'

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

  addNodeView(): NodeViewRenderer {
    return createTocNodeView()
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
